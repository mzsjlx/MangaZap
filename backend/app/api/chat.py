import json
import logging
import re
import httpx
from fastapi import APIRouter, HTTPException
from app.core import defaults

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== Session / Intent Constants ====================

CRITICAL_FIELDS = ["genre", "story_core", "protagonist", "duration"]

CRITICAL_FIELD_QUESTIONS = {
    "genre": "你想做什么题材的故事呢？比如武侠、科幻、言情、悬疑…",
    "story_core": "这个故事的核心是什么？比如热血战斗、恩怨情仇、甜蜜爱情…",
    "protagonist": "主角怎么设定？单主角、双主角、还是群像？",
    "duration": "目标时长多少？1分钟内、1-2分钟、还是更长？",
}

EMPTY_SESSION = {
    "genre": None,
    "visual_style": None,
    "story_core": None,
    "protagonist": None,
    "duration": None,
    "material_source": None,
    "dialogue": None,
    "narration_style": None,
    "music_style": None,
    "custom_notes": None,
}

EXTRACT_INFO_SYSTEM = """你是一个友好、热情的 AI 漫剧创作助手。当前已收集的信息：
{session}

用户最新输入：{user_input}

请分析并输出 JSON（不要添加额外解释），格式如下：
{{
  "intent": "provide_info" | "ask_to_generate" | "modify_previous" | "other",
  "extracted_info": {{
    "genre": "提取的值或 null",
    "visual_style": "提取的值或 null",
    "story_core": "提取的值或 null",
    "protagonist": "提取的值或 null",
    "duration": "提取的值或 null",
    "material_source": "提取的值或 null",
    "dialogue": "是/否 或 null",
    "narration_style": "提取的值或 null",
    "music_style": "提取的值或 null",
    "custom_notes": "提取的自由文本或 null"
  }},
  "missing_critical_fields": ["缺失的关键字段名称，按重要性排序（genre, story_core, protagonist, duration）"],
  "ai_reply": "一句自然、亲切、简短的回复（不超过30字）。应肯定用户输入，如需引导则提出下一个问题。例如：'热血战斗，真带劲！接下来主角是单枪匹马还是团队？'"
}}

规则：
- 如果用户输入包含生成意图（如"开始制作"、"生成剧本"、"确认"、"开始吧"），将 intent 设为 "ask_to_generate"。
- 如果用户提供了具体信息（如"武侠"、"热血战斗"），将 intent 设为 "provide_info"。
- missing_critical_fields 只包含当前仍未填写的、且属于关键字段（genre, story_core, protagonist, duration）的字段名。
- ai_reply 必须包含对用户输入的正面确认，并自然引出下一步问题。
- 如果信息已完整，ai_reply 类似"信息齐全，正在为您生成剧本草稿…"。
- extracted_info 中只提取用户明确提供的信息，不要猜测。"""


# ==================== Question Generation Constants ====================

GENERATE_QUESTIONS_SYSTEM = """你是一个专业的漫剧创作助手。用户想创作一部「{topic}」题材的漫剧。

请根据这个题材，生成8个选择题帮助用户明确创作方向。

【极其重要】每个选择题必须包含5个选项：
- 前3个：与「{topic}」题材紧密相关的具体选项（必须是真实、有意义的选项，不能是"默认选项"或"选项1"之类的占位符）
- 第4个：{{"label": "自由输入", "description": "自定义"}}
- 第5个：{{"label": "AI推荐", "description": "AI根据题材自动推荐"}}

【极其重要】每个选项必须包含 `id` 字段，用于前端识别选项值。对于 duration 问题，选项的 id 必须为：
- "1分钟内" → id: "under_1min"
- "1-2分钟" → id: "1_2min"
- "2-3分钟" → id: "2_3min"
其他问题的选项 id 由你自行决定（使用英文小写下划线格式，如 "cyberpunk"、"romantic" 等）。

8个问题的id和顺序固定为：
1. visual_style - 视觉风格（画面整体风格）
2. story_core - 故事核心/冲突（主线矛盾）
3. protagonist - 主角设定（主角类型）
4. duration - 目标时长（视频长度）
5. material_source - 素材来源（已有素材情况）
6. dialogue - 对话类型（是否有对白）
7. narration_style - 旁白风格（叙述方式）
8. music_style - 配乐风格（背景音乐类型）

【示例：科幻题材的visual_style问题】
{{"id": "visual_style", "text": "请选择视觉风格", "options": [
  {{"id": "cyberpunk", "label": "赛博朋克", "description": "霓虹灯、高科技、低生活质感"}},
  {{"id": "space_sci_fi", "label": "星际科幻", "description": "太空站、飞船、浩瀚宇宙"}},
  {{"id": "post_apocalyptic", "label": "废土末日", "description": "荒芜大地、破败废墟、生存挣扎"}},
  {{"label": "自由输入", "description": "自定义风格"}},
  {{"label": "AI推荐", "description": "AI根据题材自动推荐"}}
]}}

【示例：言情题材的story_core问题】
{{"id": "story_core", "text": "故事的核心冲突是什么", "options": [
  {{"id": "tragic_love", "label": "虐恋情深", "description": "相爱却无法在一起的痛苦"}},
  {{"id": "reunion", "label": "破镜重圆", "description": "分手后再次相遇与和解"}},
  {{"id": "secret_crush", "label": "暗恋成真", "description": "从单恋到双向奔赴"}},
  {{"label": "自由输入", "description": "自定义核心"}},
  {{"label": "AI推荐", "description": "AI根据题材自动推荐"}}
]}}

输出纯JSON（不要markdown、不要解释）：
{{
  "questions": [
    {{
      "id": "visual_style",
      "text": "请选择视觉风格",
      "options": [
        {{"id": "具体选项1英文id", "label": "具体选项1", "description": "一句话描述"}},
        {{"id": "具体选项2英文id", "label": "具体选项2", "description": "一句话描述"}},
        {{"id": "具体选项3英文id", "label": "具体选项3", "description": "一句话描述"}},
        {{"label": "自由输入", "description": "自定义"}},
        {{"label": "AI推荐", "description": "AI根据题材自动推荐"}}
      ]
    }},
    ...（其余7个问题类似格式）
  ]
}}

【再次强调】
- 每个问题的前3个选项必须是与「{topic}」相关的具体、有意义的选项
- 每个选项必须包含 `id` 字段（英文小写下划线格式），"自由输入"和"AI推荐"选项不需要id
- 选项label不超过8个字，description一句话（不超过20字）
- duration问题的选项id必须为：under_1min、1_2min、2_3min
- dialogue问题的选项应为：有对白、纯音效与配乐、AI决定
- 不要输出任何解释，只输出JSON"""


AI_RECOMMEND_SYSTEM = """你是一个专业的漫剧创作助手。用户想创作一部「{topic}」题材的漫剧。

请为以下问题生成一个最佳推荐：
问题：{question_text}
字段ID：{field_id}

当前已确定的信息：
{session_context}

请输出纯JSON（不要markdown）：
{{
  "label": "推荐选项名称（不超过8字）",
  "description": "一句话描述推荐理由（不超过20字）"
}}

注意：
- 推荐必须与「{topic}」题材高度相关
- 如果有已确定的信息（如视觉风格、故事核心），推荐应与之协调
- 给出你认为最适合这个题材的选择"""


QUESTION_TEXTS = {
    "visual_style": "视觉风格",
    "story_core": "故事核心/冲突",
    "protagonist": "主角设定",
    "duration": "目标时长",
    "material_source": "素材来源",
    "dialogue": "对话类型",
    "narration_style": "旁白风格",
    "music_style": "配乐风格",
}


# ==================== Script Generation Constants ====================

GENERATE_SCRIPT_SYSTEM = """你是一个专业的漫剧编剧。根据用户提供的所有创作参数，生成一个完整的短片剧本。

**重要要求：每一幕的场景描述和事件描述必须有至少100个字的详细内容，不能只有几个字。**

输出格式要求（纯文本，不要用JSON）：

📜 **{{标题}}**

**类型：** {{类型}}
**时长：** {{时长}}
**基调：** {{基调}}
**故事梗概：** {{3-5句话概括，包含起承转合}}

---

**人物设定：**

👤 **{{角色名}}** — {{身份}}
性格：{{性格特点，至少20个字的详细描述}}
外貌：{{外貌特色，至少20个字的详细描述}}
背景：{{角色背景故事，至少30个字}}

（根据需要添加更多角色）

---

**场景分幕：**

**第一幕：{{标题}}**
场景：{{详细场景描述，包括地点、时间、环境、光线、氛围，至少50个字}}
人物：{{出场人物及其状态}}
事件：{{详细事件描述，包括动作、对话、情感变化，至少100个字的完整故事内容}}
冲突：{{本幕的核心冲突或悬念}}
预计时长：{{秒数}}秒

**第二幕：{{标题}}**
场景：{{详细场景描述...}}
人物：{{出场人物及其状态}}
事件：{{详细事件描述，至少100个字，包含完整的场景内容、角色互动、情感发展}}
冲突：{{本幕的核心冲突或悬念}}
预计时长：{{秒数}}秒

（根据时长自动决定幕数，一般2-5幕，**每幕事件描述必须有100个字以上的详细内容**）

---

**关键转折：**
{{描述故事的关键转折点，至少30个字}}

**结局：**
{{描述故事结局，至少30个字}}

请确保剧本完整、有吸引力、内容详细。**每幕的事件描述必须有100个字以上的详细内容，不能只有标题和几个字的描述。**"""


MODIFY_SCRIPT_SYSTEM = """你是一个专业的剧本编剧。用户对现有剧本提出了修改意见，请根据修改类别和具体要求，修改剧本的对应部分。

修改类别：{category}
修改要求：{requirement}

原始剧本：
{original_script}

请只修改与要求相关的部分，保持其他内容不变。输出修改后的完整剧本，格式与原剧本一致。"""


MODIFY_SCRIPT_FREE_SYSTEM = """你是一个专业的剧本编剧。用户对现有剧本提出了自由修改意见，请根据修改要求整体调整剧本。

要求：
1. 保留原剧本的整体结构和核心情节
2. 根据用户的修改意见进行针对性调整
3. 保持剧本格式的一致性
4. 输出完整的修改后剧本

原始剧本：
{original_script}

用户修改意见：{modification_request}"""


STORYBOARD_SYSTEM = """你是一位专业的漫剧分镜脚本作家。请根据以下剧本和目标时长，生成一份文学化的分镜脚本。每个镜头按照下面的格式写成一个自然段，包含景别、运镜、环境、光影、动态细节、音效等，用流畅的中文叙述。

**【强制约束】总时长必须严格控制在 {target_duration} 秒左右（允许 ±10% 误差），每个镜头 8-15 秒，不得少于 5 秒。**

剧本内容：
{script_content}

目标总时长：{target_duration} 秒

## 输出格式（请严格遵守）

# 分镜设计

**总镜头数**：[自动计算] | **预计总时长**：{target_duration}秒

**镜一 · [标题]（0–12秒）**
[详细描述：景别。镜头运动。环境氛围。光线变化。关键动作/动态细节。音效或配乐提示。]
- **角色**：角色名
- **场景**：场景名

**镜二 · [标题]（12–24秒）**
[同上]
- **角色**：角色名
- **场景**：场景名

**镜三 · [标题]（24–36秒）**
[同上]
- **角色**：角色名
- **场景**：场景名

（继续生成更多镜头，直到覆盖全部 {target_duration} 秒）

**创作要求**：
1. **镜头数量**：必须生成 6-10 个镜头。镜头数 = 目标总时长 ÷ 每个镜头时长（约 10 秒）。例如 90 秒应生成约 9 个镜头。
2. **时长要求**：每个镜头 8-15 秒，不得少于 5 秒。所有镜头时长之和必须接近 {target_duration} 秒。
3. **时间连续性**：时间范围从 0 开始连续分配，前一个镜头的结束时间 = 后一个镜头的起始时间。最后一个镜头的结束时间 = {target_duration}。
4. 每个镜头的标题（如"晨雾"、"破晓"）应概括该镜头的核心意象。标题可省略，格式为 **镜一（0–12秒）**。
5. 描述要具体、可视觉化，语言富有诗意和画面感，类似电影文学脚本。
6. 适当加入音效提示（用"音效："或括号注明）。
7. 不要求分项列出"景别"、"运镜"等字段，将它们自然地融入叙述中。
8. 镜头之间应有连贯的节奏变化（如慢-快-慢）。
9. 最后一个镜头应落在动作顶点或情绪余韵上。
10. **自检**：输出前确认：(1) 镜头数量 ≥ 6，(2) 每个镜头 ≥ 5 秒，(3) 所有时长相加 = {target_duration} 秒。
11. **角色与场景**：每个镜头必须包含 `- **角色**：角色名` 和 `- **场景**：场景名`。角色名必须与剧本中的角色名称完全一致，场景名应与关键视觉元素中的场景名大致匹配。若无特定角色或场景，填"无"。

现在，请根据剧本生成分镜设计。"""


KEY_ELEMENTS_SYSTEM = """你是一位专业的漫剧视觉设计师。请根据以下剧本，生成一份详细、结构化的关键视觉元素描述。必须严格按下面的格式输出，每个维度都要基于剧本内容进行合理创作。

剧本内容：
{script_content}

## 输出格式（请严格遵守，使用 Markdown）

# 关键视觉元素

## 一、角色形象

### 主角：（角色名称）
[用一段自然流畅的中文描述该角色，必须涵盖以下要素（顺序不限，融入描述中）：年龄、种族、脸型与五官特征（眼型、鼻型、唇形、特殊标记如泪痣等）、肤色、发型（长度、卷直、颜色、刘海等）、妆容、服装样式与配色、配饰（腕饰、戒指、耳环等）、手部细节（茧、墨迹等）、整体气质（外在表现与内心状态）、动作习惯。描述风格参考用户示例："沈如初：一位二十七岁的亚洲女性，外表像一团燃烧的、带着迷幻色彩的火焰。她或许留着慵懒的大波浪卷发..."。]

### 配角：（角色名称）
（同样用一段话描述）

## 二、场景设定
### 主要场景一：（场景名称）
- **空间结构**：[建筑布局、地形地貌、透视关系，如"城市街景、自然荒野、室内空间"]
- **氛围营造**：[光照条件、天气、时间感，如"黄昏暖光、雨夜冷调、科幻霓虹"]
- **叙事细节**：[道具陈设、痕迹线索、文化符号，如"墙上的海报、地面的磨损、建筑风格"]

### 主要场景二：（场景名称）
（同上结构）

## 三、视觉风格
- **风格类型**：写实/国漫/水墨等（与剧本基调一致）
- **主色调**：基底色+点缀色
- **光影风格**：柔和漫射光/高对比阴影
- **画面质感**：皮肤次表面散射，布料纹理，金属光泽

## 四、情绪与氛围
- **核心情绪**：...
- **氛围词**：...

## 创作要求
1. 所有信息必须源自或合理推断自剧本。
2. 对于角色，重点描述服装、姿态、色彩，面部特征避免过度细节化。
3. 场景描述从空间结构、氛围营造、叙事细节三个维度展开，确保可视觉化。
4. 保持与剧本情绪基调一致。
5. 角色数量与剧本中一致，场景数量与剧本幕数一致。
6. 场景描述中严禁出现任何人物相关内容，只描述纯环境信息。
7. 角色描述必须采用自然段落格式，禁止使用列表或分点。

现在，请根据剧本生成关键视觉元素描述。"""


NARRATION_SYSTEM = """你是一个专业的旁白编剧。根据以下剧本，生成旁白文本和音乐音效提示。

剧本内容：
{script_content}

对话类型：{dialogue_type}

请用人类可读的白话文格式生成（纯文本，不要JSON）：

**旁白文本**
- 场景名：旁白内容（语气：低沉/激昂/温柔，时机：开场/过渡/结尾）
- 场景名：旁白内容...

**音乐配乐**
- 场景名：音乐风格（如：悬疑电子、温暖钢琴），情绪：紧张/温馨/悲伤
- 场景名：音乐风格...

**音效提示**
- 场景名：音效描述（如：脚步声、风声、门响），时机：开场/过渡/结尾
- 场景名：音效描述...

注意：
- 旁白文本要简洁有力，每段不超过50个字
- 音乐风格要与场景情绪匹配
- 音效要具体可执行"""


DIALOGUE_SYSTEM = """你是一个专业的对白编剧。根据以下剧本，生成角色对话。

剧本内容：
{script_content}

请用人类可读的白话文格式生成（纯文本，不要JSON）：

**场景名**
- 角色名（情绪）：对话内容
- 角色名（情绪）：对话内容
- 旁白：场景描述或动作提示

**场景名**
- 角色名（情绪）：对话内容
...

注意：
- 对话要符合角色性格
- 每句对话简洁自然
- 包含情绪提示（如：平静、激动、悲伤）
- 可以包含动作提示"""


MODIFY_KEY_ELEMENTS_SYSTEM = """你是一位专业的漫剧视觉设计师。用户对之前生成的关键视觉元素提出了修改意见。请根据修改要求，**完整地、逐项地**更新整个关键视觉元素描述。

原始关键元素：
{original_content}

修改要求：
{modification_request}

## 重要规则
1. 你必须输出**完整的**关键视觉元素描述，包括四个维度全部内容（一、角色形象；二、场景设定；三、视觉风格；四、情绪与氛围）。其中每个角色（主角和配角）需以自然段落格式描述（涵盖年龄、五官特征、发型、服装、配饰、气质、动作习惯等要素），禁止使用列表或分点。每个场景需包含「空间结构」「氛围营造」「叙事细节」三个维度。
2. **场景设定必须保留所有场景**，数量与原始内容一致，使用相同的编号（主要场景一、主要场景二等），不能合并、删除或改变顺序。
3. **场景描述中严禁出现任何人物相关内容**（如人物动作、表情、对白、角色名等），只描述纯环境信息。如果原始内容中场景部分包含人物描述，请在输出时移除。
4. 只修改用户要求的部分，其余部分保持原样（但需要输出完整内容）。
5. 格式必须与原始内容一致（使用 Markdown 标题和列表）。
6. 确保修改后的描述符合剧本逻辑和整体风格。

请输出修改后的完整关键视觉元素描述。"""


MODIFY_NARRATION_SYSTEM = """你是一个专业的旁白编剧。用户对旁白文本提出了修改意见。

修改要求：{modification_request}

原始旁白：
{original_content}

请根据修改要求修改旁白文本。你必须输出完整的、修改后的旁白内容，包含以下三个部分，缺一不可：

**旁白文本**
（根据修改要求更新旁白，未提及的场景旁白保持不变）

**音乐配乐**
（根据修改要求更新音乐配乐，未提及的场景配乐保持不变）

**音效提示**
（根据修改要求更新音效提示，未提及的场景音效保持不变）

重要：必须输出所有三个部分的完整内容，不能只输出修改的部分。每个部分至少保留原始内容的详细程度。"""


MODIFY_DIALOGUE_SYSTEM = """你是一个专业的对白编剧。用户对角色对话提出了修改意见。

修改要求：{modification_request}

原始对话：
{original_content}

请根据修改要求修改角色对话。你必须输出完整的、修改后的对话内容，包含所有场景的对话，不能只输出修改的部分。

输出格式要求：
- 保留所有场景的对话（包括未修改的场景）
- 每个场景使用 **场景名** 作为标题
- 每句对话格式：- 角色名（情绪）：对话内容
- 包含旁白和动作提示

重要：必须输出所有场景的完整对话内容，不能只输出修改的场景。未修改的场景保持原始对话不变。"""


MODIFY_STORYBOARD_SYSTEM = """你是一位专业的漫剧分镜脚本作家。用户对之前生成的分镜设计提出了修改意见。请根据修改要求，**完整地**更新整个分镜设计。

原始分镜：
{original_content}

修改要求：
{modification_request}

## 重要规则
1. 你必须输出**完整的、修改后的分镜设计**，格式必须与原始内容完全一致。
2. 只修改用户要求的部分，其余部分保持原样。
3. 保持镜头顺序不变，不要合并或拆分镜头（除非用户明确要求）。
4. 确保总时长与原始目标一致（或根据要求调整），每个镜头不少于 3 秒。
5. 输出内容必须符合 STORYBOARD_SYSTEM 的格式规范（每个镜头使用 `**镜一 · 标题（起始秒–结束秒）**` 标题，后跟自然段描述）。
6. 修改后的镜头必须保留 `- **角色**：角色名` 和 `- **场景**：场景名` 字段。角色名与场景名的填写规则同 STORYBOARD_SYSTEM。

请输出修改后的完整分镜设计。"""


OPTIMIZE_PROMPT_SYSTEM = """你是一个专业的AI图片提示词优化师。请根据以下关键元素，优化生成适合AI图片生成的提示词。

关键元素：
{key_elements}

场景描述：
{scene_description}

请用人类可读的白话文格式生成优化后的提示词（纯文本，不要JSON）：

**优化后的提示词（英文）**
[优化后的英文提示词，适合Midjourney/Stable Diffusion]

**负面提示词**
[负面提示词，排除不需要的元素]

**风格关键词**
[风格、光线、构图等关键词]

注意：
- 提示词用英文
- 包含风格、光线、构图等关键词
- 负面提示词排除常见问题
- 这些提示词将用于指导AI图片生成"""


PROMPT_ENGINEER_SYSTEM = """You are an AI Painting Prompt Engineer. Your output will be sent directly to Agnes to generate images.

## Input Format
You will receive a JSON object with:
- shot: Shot details (shotType, angle, content)
- character: Character info (name, visual description in Chinese)
- scene: Scene info (name, visual description in Chinese)

## Output (strictly 3 lines, each line MUST contain 5 tags)

Prompt 1: [shot: 景别, 角度], [subject: 主体动作+道具], [details: 纹理+背景+环境氛围], [lighting: 光源方向+色温+特殊光效], [mood: 情绪氛围], cinematic lighting, 8k, highly detailed --ar 16:9

Prompt 2: [shot: ...], [subject: ...], [details: ...], [lighting: ...], [mood: ...], cinematic lighting, 8k, highly detailed --ar 16:9

Prompt 3: [shot: ...], [subject: ...], [details: ...], [lighting: ...], [mood: ...], cinematic lighting, 8k, highly detailed --ar 16:9

## Rules
- Each prompt MUST contain all 5 tags: [shot:], [subject:], [details:], [lighting:], [mood:]
- Tags must be specific and visual, no abstract descriptions
- Output exactly 3 lines, no explanations, titles, or summaries
- No script elements: "类型", "梗概", "人物设定", "第一幕", "冲突", "主题"
- Prompts must be in English
- If character.visual is provided, translate it to English and include in [subject:]
- If scene.visual is provided, translate it to English and include in [details:]

## Content Matching Rules
- MUST base prompts on the actual content in shot.content
- Do NOT fabricate scenes unrelated to shot.content
- Extract visual elements from shot.content for each tag

## Continuity Rules
- The 3 prompts must represent DIFFERENT TIME POINTS of the SAME scene
- Prompt 1: Initial state (动作起始)
- Prompt 2: Action in progress (动作进行中)
- Prompt 3: Action climax/completion (动作结束/高潮)
- The subject must remain consistent across all 3 prompts
- The scene environment must remain consistent

## Example Input
{
  "shot": {
    "shotType": "全景",
    "angle": "俯视",
    "content": "女孩推开吱呀作响的旧木门，背着沉重书包走入废弃教室。午后阳光斜穿过蒙尘玻璃，在课桌上切割出明暗交错的光带。灰尘在光柱中缓慢浮动。"
  },
  "character": {"name": "", "visual": ""},
  "scene": {"name": "旧教室", "visual": "废弃的教室，蒙尘的窗玻璃，粉笔灰地板"}
}

## Example Output
Prompt 1: [shot: wide shot, high angle from outside window], [subject: girl pushing old wooden door, heavy school bag on shoulder], [details: rusted door hinge, peeling paint, dust particles floating in sunbeam, abandoned classroom with tilted desks], [lighting: warm afternoon side light cutting through dusty window, dramatic light and shadow contrast on floor], [mood: quiet, nostalgic, time standing still], cinematic lighting, 8k, highly detailed --ar 16:9

Prompt 2: [shot: medium shot, eye level], [subject: girl walking into classroom, cautious steps, hand touching door frame], [details: dust swirling around feet, old textbooks scattered on desk, spider web in corner], [lighting: sunbeam illuminating dust particles, warm yellow glow on girl's back, cool shadow in foreground], [mood: serene, slightly melancholic, intimate exploration], cinematic lighting, 8k, highly detailed --ar 16:9

Prompt 3: [shot: close-up, low angle], [subject: girl's hand tracing wood grain on door frame, finger touching rusted nail], [details: peeling paint texture, wood grain detail, blurred classroom background with bokeh light spots], [lighting: rim light outlining hand, soft warm glow, shallow depth of field], [mood: tender, intimate, connection with forgotten space], cinematic lighting, 8k, highly detailed --ar 16:9"""


# ==================== Core LLM Utility ====================

async def _call_llm(api_key: str, api_base: str, model: str, system: str, user: str) -> str:
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            f"{api_base.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.7,
                "max_tokens": 8192,
            },
        )
        response.raise_for_status()
        data = response.json()
        message = data["choices"][0]["message"]
        return (message.get("content") or message.get("reasoning_content") or "").strip()


async def _direct_llm(api_key: str, api_base: str, model: str, messages: list) -> str:
    """Directly pass messages to LLM without any processing."""
    print(f"[direct_llm] START, messages: {len(messages)}, model: {model}")
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                f"{api_base.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 4096,
                },
            )
            print(f"[direct_llm] STATUS: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            message = data["choices"][0]["message"]
            content = (message.get("content") or message.get("reasoning_content") or "").strip()
            print(f"[direct_llm] SUCCESS, content length: {len(content)}")
            return content
    except httpx.TimeoutException as e:
        print(f"[direct_llm] TIMEOUT: {str(e)}")
        raise
    except httpx.HTTPStatusError as e:
        print(f"[direct_llm] HTTP ERROR: {e.response.status_code} - {e.response.text[:200]}")
        raise
    except Exception as e:
        print(f"[direct_llm] ERROR: {type(e).__name__}: {str(e)}")
        raise


def _extract_json_from_text(text: str) -> dict | None:
    """Try to extract a JSON object from LLM output, handling markdown fences."""
    # Strategy 1: Try markdown fenced code block
    match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Strategy 2: Try parsing the entire text as JSON
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Strategy 3: Find first complete JSON object using bracket counting
    start = text.find('{')
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except json.JSONDecodeError:
                        break

    return None


# ==================== Intent Extraction & Session Management ====================

def _get_missing_critical_fields(session: dict) -> list[str]:
    """Return list of critical fields that are still None or empty."""
    return [f for f in CRITICAL_FIELDS if not session.get(f)]


def _get_fallback_reply(session: dict) -> dict:
    """Generate a fallback response when LLM fails or returns unparseable JSON."""
    missing = _get_missing_critical_fields(session)
    if not missing:
        return {
            "intent": "ask_to_generate",
            "extracted_info": {},
            "missing_critical_fields": [],
            "ai_reply": "信息齐全，正在为您生成剧本草稿…",
        }

    first_missing = missing[0]
    question = CRITICAL_FIELD_QUESTIONS.get(first_missing, "请告诉我更多信息。")
    return {
        "intent": "provide_info",
        "extracted_info": {},
        "missing_critical_fields": missing,
        "ai_reply": f"好的，已记录。{question}",
    }


async def _extract_intent(
    api_key: str, api_base: str, model: str,
    user_input: str, session: dict,
) -> dict:
    """Call LLM to extract intent and information from user input.

    Returns a dict with keys: intent, extracted_info, missing_critical_fields, ai_reply.
    Falls back to _get_fallback_reply on any error.
    """
    session_str = json.dumps(session, ensure_ascii=False, indent=2)
    system = EXTRACT_INFO_SYSTEM.format(session=session_str, user_input=user_input)
    user_prompt = f"用户输入：{user_input}"

    try:
        raw = await _call_llm(api_key, api_base, model, system, user_prompt)
        logger.info(f"[extract_intent] Raw response: {raw[:500]}")

        parsed = _extract_json_from_text(raw)
        if not parsed:
            logger.warning("[extract_intent] No JSON found in response, using fallback")
            return _get_fallback_reply(session)

        intent = parsed.get("intent", "provide_info")
        extracted_info = parsed.get("extracted_info", {})
        missing = parsed.get("missing_critical_fields", [])
        ai_reply = parsed.get("ai_reply", "")

        if not ai_reply:
            ai_reply = "好的，已记录。请继续。"

        return {
            "intent": intent,
            "extracted_info": extracted_info,
            "missing_critical_fields": missing,
            "ai_reply": ai_reply,
        }

    except json.JSONDecodeError:
        logger.warning("[extract_intent] JSON decode error, using fallback")
        return _get_fallback_reply(session)
    except httpx.HTTPStatusError as e:
        logger.warning(f"[extract_intent] HTTP error {e.response.status_code}: {e.response.text[:300]}")
        return _get_fallback_reply(session)
    except Exception as e:
        logger.warning(f"[extract_intent] Unexpected error: {e}")
        return _get_fallback_reply(session)


def _merge_session(session: dict, extracted_info: dict) -> dict:
    """Merge non-null extracted_info values into session (in-place and return)."""
    for key in EMPTY_SESSION:
        value = extracted_info.get(key)
        if value is not None:
            session[key] = value
    return session


async def process_user_input(
    api_key: str, api_base: str, model: str,
    user_input: str, session: dict,
) -> dict:
    """Core function: process any user input, update session, return response.

    Returns a dict with:
      - type: "text" or "script"
      - content: AI reply or script content
      - session: updated session dict
      - missing_critical_fields: list of still-missing critical fields
    """
    result = await _extract_intent(api_key, api_base, model, user_input, session)

    intent = result["intent"]
    extracted_info = result["extracted_info"]
    missing = result["missing_critical_fields"]
    ai_reply = result["ai_reply"]

    session = _merge_session(session, extracted_info)

    missing = _get_missing_critical_fields(session)

    should_generate = (intent == "ask_to_generate") or (len(missing) == 0)

    if should_generate:
        try:
            script_content = await _generate_script_from_session(api_key, api_base, model, session)
            return {
                "type": "script",
                "content": script_content,
                "session": session,
                "missing_critical_fields": [],
            }
        except Exception as e:
            logger.exception(f"[process_user_input] Script generation failed: {e}")
            return {
                "type": "text",
                "content": f"{ai_reply}\n\n剧本生成失败：{str(e)}",
                "session": session,
                "missing_critical_fields": missing,
            }

    return {
        "type": "text",
        "content": ai_reply,
        "session": session,
        "missing_critical_fields": missing,
    }


async def _generate_script_from_session(
    api_key: str, api_base: str, model: str, session: dict,
) -> str:
    """Generate a script using the session dict. Returns script text."""
    parts = []
    for field, value in session.items():
        if value:
            label = {
                "genre": "题材",
                "visual_style": "视觉风格",
                "story_core": "故事核心",
                "protagonist": "主角设定",
                "duration": "目标时长",
                "material_source": "素材来源",
                "dialogue": "对话",
                "narration_style": "旁白风格",
                "music_style": "配乐风格",
                "custom_notes": "其他要求",
            }.get(field, field)
            parts.append(f"- {label}：{value}")

    user_prompt = "请根据以下信息创作一个漫剧剧本：\n" + "\n".join(parts)
    if not parts:
        user_prompt = "请根据用户的想法创作一个漫剧剧本。"

    content = await _call_llm(api_key, api_base, model, GENERATE_SCRIPT_SYSTEM, user_prompt)
    return content


# ==================== Post-Script Generation Functions ====================

def _build_default_storyboard(script_content: str, target_duration: int) -> str:
    """Fallback: generate storyboard with dynamic shot count based on target duration."""
    scenes = re.findall(r'\*\*第.+?幕[：:](.+?)\*\*', script_content)
    if not scenes:
        scenes = re.findall(r'\*\*(.+?)\*\*', script_content)

    num_shots = max(6, round(target_duration / 10))
    shot_duration = target_duration // num_shots

    cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    lines = [f"# 分镜设计", "", f"**总镜头数**：{num_shots} | **预计总时长**：{target_duration}秒", ""]
    t = 0
    for i in range(num_shots):
        cn_num = cn[i] if i < len(cn) else str(i + 1)
        end = min(t + shot_duration, target_duration) if i < num_shots - 1 else target_duration
        title = scenes[i].strip() if i < len(scenes) else f"镜头{i + 1}"
        lines.append(f"**镜{cn_num} · {title}（{t}–{end}秒）**")
        lines.append(f"场景描述待生成。")
        lines.append(f"- **角色**：无")
        lines.append(f"- **场景**：无")
        lines.append("")
        t = end

    return "\n".join(lines)


_CN_NUM = {'零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
           '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
           '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
           '二十': 20, '二十五': 25, '三十': 30, '三十五': 35, '四十': 40,
           '四十五': 45, '五十': 50, '五十五': 55, '六十': 60}

_DURATION_PRESET = {
    'under_1min': 60, '1_2min': 90, '2_3min': 150,
    'short': 60, 'medium': 90, 'long': 150,
}


def parse_duration_to_seconds(text: str) -> int:
    """Parse duration string to seconds. Supports presets, Chinese, English, pure numbers."""
    if not text or not isinstance(text, str):
        return 90
    text = text.strip().lower()
    if text in _DURATION_PRESET:
        return _DURATION_PRESET[text]
    minutes = 0.0
    seconds = 0.0
    min_match = re.search(r'([零一二三四五六七八九十\d.]+)\s*(?:分钟|分|min|m(?:\b|$))', text)
    if min_match:
        s = min_match.group(1)
        minutes = _CN_NUM.get(s, float(s) if s != '半' else 0.5)
    sec_match = re.search(r'([零一二三四五六七八九十\d.]+)\s*(?:秒|s(?:ec)?(?:\b|$))', text)
    if sec_match:
        s = sec_match.group(1)
        seconds = _CN_NUM.get(s, float(s) if s != '半' else 30)
    if '半' in text and '分' in text and not sec_match:
        seconds = 30
    total = int(minutes * 60 + seconds)
    if total > 0:
        return total
    pure = re.search(r'([零一二三四五六七八九十\d.]+)', text)
    if pure:
        s = pure.group(1)
        val = _CN_NUM.get(s)
        if val is not None:
            return val * 60 if '分' in text else val
        try:
            return int(float(s))
        except ValueError:
            pass
    logger.warning(f"[parse_duration_to_seconds] Unparseable duration: '{text}', defaulting to 90s")
    return 90


async def _generate_storyboard(api_key: str, api_base: str, model: str, script_content: str, target_duration: int = 0, duration_str: str = "") -> dict:
    if not target_duration and duration_str:
        target_duration = parse_duration_to_seconds(duration_str)
    elif not target_duration:
        target_duration = 90

    system = STORYBOARD_SYSTEM.format(
        script_content=script_content,
        target_duration=target_duration,
    )
    user_prompt = f"请根据剧本生成分镜，目标总时长{target_duration}秒。"

    def _parse_shot_durations(content: str) -> list[int]:
        """Parse individual shot durations from content like **镜一 · 标题（0–12秒）**"""
        durations = []
        for m in re.finditer(r'（(\d+)–(\d+)秒?）', content):
            start, end = int(m.group(1)), int(m.group(2))
            durations.append(max(0, end - start))
        return durations

    def _check_storyboard(content: str, target: int) -> tuple[int, int, int, bool]:
        """Returns (shot_count, total_parsed_duration, total_reported_duration, needs_retry)"""
        shot_count = len(re.findall(r'^\*\*镜', content, re.MULTILINE))
        parsed_durations = _parse_shot_durations(content)
        total_parsed = sum(parsed_durations)
        reported_match = re.search(r'\*\*预计总时长\*\*[：:]\s*(\d+)', content)
        total_reported = int(reported_match.group(1)) if reported_match else 0

        needs_retry = False
        if shot_count < 4:
            logger.warning(f"[storyboard] Too few shots: {shot_count}")
            needs_retry = True
        if total_parsed > 0 and total_parsed < target * 0.5:
            logger.warning(f"[storyboard] Total duration too short: {total_parsed}s vs target {target}s")
            needs_retry = True
        if total_reported > 0 and total_reported < target * 0.5:
            logger.warning(f"[storyboard] Reported duration too short: {total_reported}s vs target {target}s")
            needs_retry = True

        return shot_count, total_parsed, total_reported, needs_retry

    try:
        content = await _call_llm(api_key, api_base, model, system, user_prompt)
        logger.info(f"[generate_storyboard] LLM returned {len(content)} chars")
        shot_count, total_parsed, total_reported, needs_retry = _check_storyboard(content, target_duration)
        logger.info(f"[generate_storyboard] Parsed: {shot_count} shots, parsed_total={total_parsed}s, reported_total={total_reported}s")
        logger.debug(f"[generate_storyboard] Raw content:\n{content[:2000]}")
    except Exception as e:
        logger.warning(f"[generate_storyboard] LLM call failed: {e}")
        content = ""
        needs_retry = False

    if not content.strip():
        logger.warning("[generate_storyboard] Empty content from LLM, using fallback")
        content = _build_default_storyboard(script_content, target_duration)

    if needs_retry:
        retry_user = (
            f"你生成的分镜不合格：镜头数太少或总时长远低于目标 {target_duration} 秒。"
            f"请重新生成，要求：6-10 个镜头，每个 8-15 秒，总时长接近 {target_duration} 秒。"
        )
        try:
            retry_content = await _call_llm(api_key, api_base, model, system, retry_user)
            retry_count, retry_parsed, retry_reported, retry_needs = _check_storyboard(retry_content, target_duration)
            if not retry_needs:
                content = retry_content
                logger.info(f"[generate_storyboard] Retry succeeded: {retry_count} shots, {retry_parsed}s")
            else:
                logger.warning(f"[generate_storyboard] Retry still insufficient: {retry_count} shots, {retry_parsed}s")
        except Exception as e:
            logger.warning(f"[generate_storyboard] Retry failed: {e}")

    duration_match = re.search(r'\*\*预计总时长\*\*[：:]\s*(\d+)', content)
    if duration_match:
        actual_duration = int(duration_match.group(1))
        if actual_duration > target_duration + 2:
            logger.warning(
                f"[generate_storyboard] Duration mismatch: target={target_duration}s, "
                f"actual={actual_duration}s (exceeded by {actual_duration - target_duration}s)"
            )

    return {"type": "storyboard", "content": content}


async def _generate_key_elements(api_key: str, api_base: str, model: str, script_content: str) -> dict:
    system = KEY_ELEMENTS_SYSTEM.format(script_content=script_content)
    user_prompt = "请根据剧本生成关键视觉元素。"

    try:
        content = await _call_llm(api_key, api_base, model, system, user_prompt)
    except Exception as e:
        logger.warning(f"[generate_key_elements] LLM call failed: {e}")
        content = """**角色形象**
- 主角：待补充详细外貌描述，包括服装、发型、体型、表情等
- 配角：待补充详细外貌描述

**场景设定**
- 主场景：待补充详细场景描述，包括光线、色调、氛围、关键物品
- 次场景：待补充详细场景描述

**视觉风格**
- 主色调：待补充主要使用的颜色
- 光线风格：待补充光线效果
- 整体氛围：待补充画面整体感觉"""

    return {"type": "key_elements", "content": content}


async def _generate_narration(api_key: str, api_base: str, model: str, script_content: str, dialogue_type: str) -> dict:
    system = NARRATION_SYSTEM.format(script_content=script_content, dialogue_type=dialogue_type)
    user_prompt = "请根据剧本生成旁白文本和音乐音效提示。"

    try:
        content = await _call_llm(api_key, api_base, model, system, user_prompt)
    except Exception as e:
        logger.warning(f"[generate_narration] LLM call failed: {e}")
        content = """**旁白文本**
- 开场：待补充旁白内容（语气：待定，时机：开场）
- 过渡：待补充旁白内容（语气：待定，时机：过渡）
- 结尾：待补充旁白内容（语气：待定，时机：结尾）

**音乐配乐**
- 开场：待补充音乐风格，情绪：待定
- 发展：待补充音乐风格，情绪：待定
- 高潮：待补充音乐风格，情绪：待定

**音效提示**
- 开场：待补充音效描述，时机：开场
- 过渡：待补充音效描述，时机：过渡
- 结尾：待补充音效描述，时机：结尾"""

    return {"type": "narration", "content": content}


async def _generate_dialogue(api_key: str, api_base: str, model: str, script_content: str) -> dict:
    system = DIALOGUE_SYSTEM.format(script_content=script_content)
    user_prompt = "请根据剧本生成角色对话。"

    try:
        content = await _call_llm(api_key, api_base, model, system, user_prompt)
    except Exception as e:
        logger.warning(f"[generate_dialogue] LLM call failed: {e}")
        content = """**场景 1：开场**
- 角色A（平静）：待补充对话内容
- 角色B（平静）：待补充对话内容
- 旁白：待补充场景描述或动作提示

**场景 2：发展**
- 角色A（待定）：待补充对话内容
- 角色B（待定）：待补充对话内容
- 旁白：待补充场景描述或动作提示"""

    return {"type": "dialogue", "content": content}


async def _optimize_image_prompt(api_key: str, api_base: str, model: str, key_elements: str, scene_description: str) -> dict:
    system = OPTIMIZE_PROMPT_SYSTEM.format(key_elements=key_elements, scene_description=scene_description)
    user_prompt = "请优化以下关键元素的图片生成提示词。"

    content = await _call_llm(api_key, api_base, model, system, user_prompt)
    return {"type": "optimized_prompt", "content": content}


def _extract_visual_only(shot_text: str) -> str:
    """Remove script elements from shot description, keep only visual content."""
    text = shot_text
    
    # Delete metadata headers (double insurance)
    text = re.sub(r'#\s*分镜设计.*?\n', '', text)
    text = re.sub(r'\*?\*?总镜头数\*?\*?[：:]\s*\d+.*?\n', '', text)
    text = re.sub(r'\*?\*?预计总时长\*?\*?[：:].*?\n', '', text)
    
    # Delete shot number headers
    text = re.sub(r'\*?\*?镜[一二三四五六七八九十\d]+.*?\n', '', text)
    
    # Delete character/scene tags
    text = re.sub(r'-\s*\*?\*?角色\*?\*?[：:].*?\n', '', text)
    text = re.sub(r'-\s*\*?\*?场景\*?\*?[：:].*?\n', '', text)
    
    # Only delete line-start list symbols (not hyphens in content)
    text = re.sub(r'^[-*]\s+', '', text, flags=re.MULTILINE)
    # Delete ** bold markers
    text = re.sub(r'\*\*', '', text)
    
    # Delete narrative paragraphs
    text = re.sub(r'人物设定[：:][\s\S]*?(?=场景[：:]|事件[：:]|$)', '', text)
    text = re.sub(r'冲突[：:][\s\S]*?(?=事件[：:]|$)', '', text)
    text = re.sub(r'主题[：:][\s\S]*', '', text)
    
    return text.strip()


async def _generate_keyframe_prompts(api_key: str, api_base: str, model: str,
                                      structured_input: str) -> dict:
    """Generate 3 AI painting prompts from structured JSON input."""
    result = await _call_llm(api_key, api_base, model,
                             PROMPT_ENGINEER_SYSTEM, structured_input)
    return {"type": "text", "content": result}


async def _modify_script(api_key: str, api_base: str, model: str, category: str, sub_option: str, original_script: str) -> dict:
    system = MODIFY_SCRIPT_SYSTEM.format(
        category=category,
        requirement=sub_option,
        original_script=original_script,
    )
    user_prompt = f"请根据上面的修改要求，修改剧本的{category}部分。具体要求：{sub_option}"

    content = await _call_llm(api_key, api_base, model, system, user_prompt)
    return {"type": "script", "content": content}


async def _modify_script_free(api_key: str, api_base: str, model: str, original_script: str, modification_request: str) -> dict:
    system = MODIFY_SCRIPT_FREE_SYSTEM.format(modification_request=modification_request, original_script=original_script)
    content = await _call_llm(api_key, api_base, model, system, f"请根据修改意见调整剧本：{modification_request}")
    return {"type": "script", "content": content}


async def _modify_key_elements(api_key: str, api_base: str, model: str, original_content: str, modification_request: str) -> dict:
    system = MODIFY_KEY_ELEMENTS_SYSTEM.format(modification_request=modification_request, original_content=original_content)
    content = await _call_llm(api_key, api_base, model, system, f"请修改关键元素：{modification_request}")
    return {"type": "key_elements", "content": content}


async def _modify_narration(api_key: str, api_base: str, model: str, original_content: str, modification_request: str) -> dict:
    system = MODIFY_NARRATION_SYSTEM.format(modification_request=modification_request, original_content=original_content)
    content = await _call_llm(api_key, api_base, model, system, f"请修改旁白：{modification_request}")
    return {"type": "narration", "content": content}


async def _modify_dialogue(api_key: str, api_base: str, model: str, original_content: str, modification_request: str) -> dict:
    system = MODIFY_DIALOGUE_SYSTEM.format(modification_request=modification_request, original_content=original_content)
    content = await _call_llm(api_key, api_base, model, system, f"请修改对话：{modification_request}")
    return {"type": "dialogue", "content": content}


async def _modify_storyboard(api_key: str, api_base: str, model: str, original_content: str, modification_request: str) -> dict:
    system = MODIFY_STORYBOARD_SYSTEM.format(modification_request=modification_request, original_content=original_content)
    content = await _call_llm(api_key, api_base, model, system, f"请修改分镜：{modification_request}")
    return {"type": "storyboard", "content": content}


# ==================== Question Generation Functions ====================

def _pad_options(options: list[dict], topic: str, field_id: str) -> list[dict] | None:
    """Pad options list to always have exactly 5 items (3 topic + free + ai).

    If fewer than 3 topic-specific options remain after removing fixed ones,
    return None to signal that the caller should use fallback questions instead.
    """
    cleaned = [o for o in options if o.get("label") not in ("自由输入", "AI推荐")]
    if len(cleaned) < 3:
        logger.warning(f"[_pad_options] Only {len(cleaned)} topic options for field '{field_id}', need 3+. Returning None.")
        return None
    result = cleaned[:3]
    result.append({"label": "自由输入", "description": "自定义"})
    result.append({"label": "AI推荐", "description": "AI根据题材自动推荐"})
    return result


def _get_fallback_questions(topic: str) -> list[dict]:
    """Complete fallback: 8 questions, each with 3 generic options + free input + AI recommend."""
    return [
        {
            "id": "visual_style",
            "text": "请选择视觉风格",
            "options": [
                {"label": "写实风格", "description": "接近真实电影质感"},
                {"label": "动画风格", "description": "卡通或动漫渲染"},
                {"label": "水墨风格", "description": "中国传统水墨画风"},
                {"label": "自由输入", "description": "自定义风格"},
                {"label": "AI推荐", "description": "AI根据题材自动推荐"},
            ],
        },
        {
            "id": "story_core",
            "text": "故事的核心冲突是什么",
            "options": [
                {"label": "热血战斗", "description": "以打斗和对抗为主线"},
                {"label": "恩怨情仇", "description": "人物关系和情感纠葛"},
                {"label": "成长蜕变", "description": "主角从弱到强的历程"},
                {"label": "自由输入", "description": "自定义核心"},
                {"label": "AI推荐", "description": "AI根据题材自动推荐"},
            ],
        },
        {
            "id": "protagonist",
            "text": "主角设定是怎样的",
            "options": [
                {"label": "独行侠客", "description": "一人闯荡江湖"},
                {"label": "双雄对决", "description": "两个主角对立或协作"},
                {"label": "群像叙事", "description": "多角色多线索展开"},
                {"label": "自由输入", "description": "自定义主角"},
                {"label": "AI推荐", "description": "AI根据题材自动推荐"},
            ],
        },
        {
            "id": "duration",
            "text": "目标时长是多少",
            "options": [
                {"id": "under_1min", "label": "1分钟内", "description": "短视频，节奏紧凑"},
                {"id": "1_2min", "label": "1-2分钟", "description": "标准短片"},
                {"id": "2_3min", "label": "2-3分钟", "description": "较长篇幅，内容丰富"},
                {"label": "自由输入", "description": "自定义时长"},
                {"label": "AI推荐", "description": "AI根据题材自动推荐"},
            ],
        },
        {
            "id": "material_source",
            "text": "你有现成的素材吗",
            "options": [
                {"label": "有剧本", "description": "已有完整剧本文字"},
                {"label": "有参考", "description": "有参考图片或视频"},
                {"label": "从零开始", "description": "完全由AI生成"},
                {"label": "自由输入", "description": "自定义素材情况"},
                {"label": "AI推荐", "description": "AI根据题材自动推荐"},
            ],
        },
        {
            "id": "dialogue",
            "text": "对话类型是怎样的",
            "options": [
                {"label": "有对白", "description": "人物之间有对话"},
                {"label": "纯音效与配乐", "description": "没有对白，只有旁白和音乐"},
                {"label": "AI决定", "description": "由AI根据剧情决定"},
                {"label": "自由输入", "description": "自定义对话方式"},
                {"label": "AI推荐", "description": "AI根据题材自动推荐"},
            ],
        },
        {
            "id": "narration_style",
            "text": "旁白风格是怎样的",
            "options": [
                {"label": "传统叙述", "description": "第三人称客观讲述"},
                {"label": "第一人称", "description": "主角视角内心独白"},
                {"label": "无旁白", "description": "纯画面和对话叙事"},
                {"label": "自由输入", "description": "自定义旁白风格"},
                {"label": "AI推荐", "description": "AI根据题材自动推荐"},
            ],
        },
        {
            "id": "music_style",
            "text": "配乐风格是怎样的",
            "options": [
                {"label": "激昂战斗", "description": "快节奏，紧张刺激"},
                {"label": "悠扬古风", "description": "古典乐器，意境深远"},
                {"label": "现代电子", "description": "电子音乐，科技感强"},
                {"label": "自由输入", "description": "自定义配乐风格"},
                {"label": "AI推荐", "description": "AI根据题材自动推荐"},
            ],
        },
    ]


async def _generate_questions(api_key: str, api_base: str, model: str, topic: str) -> dict:
    """Generate 8 structured questions based on the user's topic.

    Returns: {type: "questions", questions: [...], greeting: "..."}
    Falls back to hardcoded questions if LLM output is invalid.
    """
    system = GENERATE_QUESTIONS_SYSTEM.format(topic=topic)
    user_prompt = f"请为「{topic}」题材生成8个选择题。每个问题必须有3个与题材相关的具体选项。"

    try:
        raw = await _call_llm(api_key, api_base, model, system, user_prompt)
        logger.info(f"[generate_questions] Raw LLM response ({len(raw)} chars): {raw[:2000]}")

        parsed = _extract_json_from_text(raw)
        logger.info(f"[generate_questions] Parsed JSON keys: {list(parsed.keys()) if parsed else 'None'}")

        if parsed and "questions" in parsed:
            questions = parsed["questions"]
            logger.info(f"[generate_questions] Found {len(questions)} questions from LLM")

            all_valid = True
            for i, q in enumerate(questions):
                opts = q.get("options", [])
                topic_opts = [o for o in opts if o.get("label") not in ("自由输入", "AI推荐")]
                logger.info(
                    f"[generate_questions] Q{i+1} ({q.get('id', '?')}): "
                    f"{len(opts)} total options, {len(topic_opts)} topic-specific"
                )

                if len(opts) != 5:
                    padded = _pad_options(opts, topic, q.get("id", ""))
                    if padded is None:
                        logger.warning(
                            f"[generate_questions] Q{i+1} ({q.get('id', '?')}) has fewer than 3 topic options, "
                            f"will use fallback for ALL questions"
                        )
                        all_valid = False
                        break
                    q["options"] = padded

            if all_valid and len(questions) == 8:
                logger.info("[generate_questions] All 8 questions valid, using LLM output")
                return {
                    "type": "questions",
                    "questions": questions,
                    "greeting": f"好的，「{topic}」是个很棒的题材！让我问你8个问题来明确创作方向。",
                }
            else:
                logger.warning(
                    f"[generate_questions] Validation failed (all_valid={all_valid}, count={len(questions)}), using fallback"
                )
        else:
            logger.warning("[generate_questions] No 'questions' key in parsed JSON, using fallback")
    except Exception as e:
        logger.warning(f"[generate_questions] LLM call failed: {e}")

    fallback = _get_fallback_questions(topic)
    logger.info(f"[generate_questions] Returning fallback: {len(fallback)} questions")
    return {
        "type": "questions",
        "questions": fallback,
        "greeting": f"好的，「{topic}」题材！让我问你8个问题来明确创作方向。",
    }


async def _ai_recommend(
    api_key: str, api_base: str, model: str,
    topic: str, field_id: str, session: dict,
) -> dict:
    """Generate a recommendation for a single question.

    Returns: {type: "ai_recommend", field: "...", label: "...", description: "..."}
    """
    question_text = QUESTION_TEXTS.get(field_id, field_id)
    session_context = "\n".join(
        f"- {QUESTION_TEXTS.get(k, k)}：{v}"
        for k, v in session.items()
        if v and k not in ("custom_notes", "topic")
    ) or "暂无"

    system = AI_RECOMMEND_SYSTEM.format(
        topic=topic,
        question_text=question_text,
        field_id=field_id,
        session_context=session_context,
    )
    user_prompt = f"请为「{topic}」题材推荐{question_text}。"

    try:
        raw = await _call_llm(api_key, api_base, model, system, user_prompt)
        logger.info(f"[ai_recommend] Raw response: {raw[:300]}")

        parsed = _extract_json_from_text(raw)
        if parsed and "label" in parsed:
            return {
                "type": "ai_recommend",
                "field": field_id,
                "label": parsed["label"],
                "description": parsed.get("description", ""),
            }
    except Exception as e:
        logger.warning(f"[ai_recommend] LLM call failed: {e}")

    fallback_labels = {
        "visual_style": "写实风格",
        "story_core": "热血战斗",
        "protagonist": "独行侠客",
        "duration": "1-2分钟",
        "material_source": "从零开始",
        "dialogue": "有对白",
        "narration_style": "传统叙述",
        "music_style": "激昂战斗",
    }
    return {
        "type": "ai_recommend",
        "field": field_id,
        "label": fallback_labels.get(field_id, "AI推荐"),
        "description": f"AI推荐的{question_text}选择",
    }


# ==================== Backward-Compatibility Helpers ====================

def _build_session_from_choices(choices: dict) -> dict:
    """Convert old-style choices dict (from frontend wizard) into a session dict.

    Maps frontend wizard step IDs to session field names:
      - topic → genre (if no explicit genre)
      - videoType → genre
      - storyCore → story_core
      - protagonist → protagonist
      - duration → duration
      - materials → material_source
      - visualStyle → visual_style
      - dialogueType → dialogue
      - reference → custom_notes
    """
    session = dict(EMPTY_SESSION)

    mapping = {
        "videoType": "genre",
        "storyCore": "story_core",
        "protagonist": "protagonist",
        "duration": "duration",
        "materials": "material_source",
        "visualStyle": "visual_style",
        "dialogueType": "dialogue",
        "reference": "custom_notes",
    }
    for wizard_key, session_key in mapping.items():
        value = choices.get(wizard_key)
        if value:
            session[session_key] = value

    if not session["genre"] and choices.get("topic"):
        session["genre"] = choices["topic"]

    return session


# ==================== Router ====================

@router.post("/api/chat")
async def chat(data: dict):
    action = data.get("action", "")
    api_config = data.get("api_config", {})

    api_key = api_config.get("key", "")
    api_base = api_config.get("base_url", defaults.CHAT_BASE_URL)
    model = api_config.get("model", defaults.CHAT_MODEL)

    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required. Please configure your API key first.")

    try:
        if action == "chat":
            user_input = data.get("user_input", "")
            session = data.get("session", dict(EMPTY_SESSION))
            result = await process_user_input(api_key, api_base, model, user_input, session)
            return result

        elif action == "generate_questions":
            topic = data.get("topic", "")
            if not topic:
                raise HTTPException(status_code=400, detail="topic is required")
            result = await _generate_questions(api_key, api_base, model, topic)
            return result

        elif action == "ai_recommend":
            topic = data.get("topic", "")
            field_id = data.get("field_id", "")
            session = data.get("session", {})
            if not topic or not field_id:
                raise HTTPException(status_code=400, detail="topic and field_id are required")
            result = await _ai_recommend(api_key, api_base, model, topic, field_id, session)
            return result

        elif action == "next_step":
            topic = data.get("topic", "")
            choices = data.get("choices", {})

            last_choice_value = ""
            for key in reversed(list(choices.keys())):
                if key != "topic" and choices[key]:
                    last_choice_value = choices[key]
                    break

            user_input = last_choice_value or topic or ""
            session = _build_session_from_choices(choices)

            result = await process_user_input(api_key, api_base, model, user_input, session)
            return result

        elif action == "generate_script":
            session = data.get("session")
            if session:
                logger.info("[generate_script] Using new session format directly")
            else:
                choices = data.get("choices", {})
                session = _build_session_from_choices(choices)
                logger.info("[generate_script] Using old choices format, converted to session")
            script_content = await _generate_script_from_session(api_key, api_base, model, session)
            return {"type": "script", "content": script_content, "session": session, "missing_critical_fields": []}

        elif action == "modify_script":
            category = data.get("modification_category", "")
            sub_option = data.get("sub_option", "")
            original_script = data.get("original_script", "")
            result = await _modify_script(api_key, api_base, model, category, sub_option, original_script)
            return result

        elif action == "modify_script_free":
            original_script = data.get("original_script", "")
            modification_request = data.get("modification_request", "")
            result = await _modify_script_free(api_key, api_base, model, original_script, modification_request)
            return result

        elif action == "modify_key_elements":
            original_content = data.get("original_content", "")
            modification_request = data.get("modification_request", "")
            result = await _modify_key_elements(api_key, api_base, model, original_content, modification_request)
            return result

        elif action == "modify_narration":
            original_content = data.get("original_content", "")
            modification_request = data.get("modification_request", "")
            result = await _modify_narration(api_key, api_base, model, original_content, modification_request)
            return result

        elif action == "modify_dialogue":
            original_content = data.get("original_content", "")
            modification_request = data.get("modification_request", "")
            result = await _modify_dialogue(api_key, api_base, model, original_content, modification_request)
            return result

        elif action == "modify_storyboard":
            original_content = data.get("original_content", "")
            modification_request = data.get("modification_request", "")
            result = await _modify_storyboard(api_key, api_base, model, original_content, modification_request)
            return result

        elif action == "generate_storyboard":
            script_content = data.get("script_content", "")
            target_duration = data.get("target_duration", 0)
            duration_str = data.get("duration_str", "")
            result = await _generate_storyboard(api_key, api_base, model, script_content, target_duration, duration_str)
            return result

        elif action == "generate_key_elements":
            script_content = data.get("script_content", "")
            result = await _generate_key_elements(api_key, api_base, model, script_content)
            return result

        elif action == "generate_narration":
            script_content = data.get("script_content", "")
            dialogue_type = data.get("dialogue_type", "有对白")
            result = await _generate_narration(api_key, api_base, model, script_content, dialogue_type)
            return result

        elif action == "generate_dialogue":
            script_content = data.get("script_content", "")
            result = await _generate_dialogue(api_key, api_base, model, script_content)
            return result

        elif action == "optimize_image_prompt":
            key_elements = data.get("key_elements", "")
            scene_description = data.get("scene_description", "")
            result = await _optimize_image_prompt(api_key, api_base, model, key_elements, scene_description)
            return result

        elif action == "generate_keyframe_prompts":
            shot_data = data.get("shot_data", {})
            
            # Validate content is not empty
            if not shot_data.get("content"):
                logger.warning(f"[generate_keyframe_prompts] shot_data.content is empty")
                return {"type": "error", "content": "shot_data.content is empty. Please check storyboard format."}
            
            char_visual = data.get("character_visual", "")
            scene_visual = data.get("scene_visual", "")
            
            import json
            structured_input = json.dumps({
                "shot": shot_data,
                "character": {"name": "", "visual": char_visual} if char_visual else None,
                "scene": {"name": "", "visual": scene_visual} if scene_visual else None
            }, ensure_ascii=False, indent=2)
            
            result = await _generate_keyframe_prompts(api_key, api_base, model, structured_input)
            return result

        elif action == "direct_llm":
            messages = data.get("messages", [])
            if not messages:
                user_input = data.get("user_input", "")
                if user_input:
                    messages = [{"role": "user", "content": user_input}]
                else:
                    raise HTTPException(status_code=400, detail="No messages provided")
            
            try:
                result = await _direct_llm(api_key, api_base, model, messages)
                return {"type": "text", "content": result}
            except httpx.HTTPStatusError as e:
                error_text = e.response.text[:500]
                logger.error(f"[direct_llm] API error: {e.response.status_code} - {error_text}")
                raise HTTPException(status_code=502, detail=f"LLM API error: {e.response.status_code}")
            except httpx.TimeoutException:
                raise HTTPException(status_code=504, detail="LLM API timeout")
            except Exception as e:
                logger.exception(f"[direct_llm] Error: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    except httpx.HTTPStatusError as e:
        error_text = e.response.text[:500]
        logger.error(f"API error: {e.response.status_code} - {error_text}")
        if "image" in error_text.lower() and "not support" in error_text.lower():
            raise HTTPException(status_code=400, detail="该模型不支持图片输入，请使用纯文本输入")
        raise HTTPException(status_code=502, detail=f"API returned error: {e.response.status_code}")
    except Exception as e:
        error_msg = str(e)
        logger.exception(f"Chat action failed: {action}")
        if "image" in error_msg.lower() and ("not support" in error_msg.lower() or "cannot read" in error_msg.lower()):
            raise HTTPException(status_code=400, detail="该模型不支持图片输入，请使用纯文本输入")
        raise HTTPException(status_code=500, detail=error_msg)
