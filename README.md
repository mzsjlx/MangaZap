
MangaZap — AI 漫画视频生成器

通过对话式 AI 引导，从零开始创作漫改短视频。只需输入想法，AI 帮你完成剧本、分镜、角色设计、语音配音和视频合成。

---

✨ 核心功能

功能	说明	
🎬 8 问向导	AI 通过 8 个问题引导，生成完整剧本	
🖼 关键帧生成	自动提取角色和场景，生成多张关键帧图片	
🎙 角色语音	为每个角色分配音色，生成对话语音（MiMo TTS）	
🎥 视频合成	关键帧图片动画化 + 语音合成，输出漫改视频（Agnes AI）	
📂 项目管理	会话状态持久化，支持保存和继续编辑	

---

🛠 技术栈

层级	技术	
前端	React 19 + TypeScript + Tailwind CSS + Vite	
后端	Python 3.12 + FastAPI + Pydantic + httpx	
AI 服务	MiMo TTS（语音）+ Agnes AI（图生视频）	
视频合成	FFmpeg	

---

🚀 快速开始

1. 克隆项目

```bash
git clone https://github.com/your-username/mangazap.git
cd mangazap
```

2. 启动后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv

# 激活（Windows）
venv\Scripts\activate
# 激活（Mac/Linux）
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

3. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

4. 配置 API Key

打开应用主页 → 点击"API 设置" → 配置以下 Key：

服务	用途	获取方式	
MiMo TTS	角色语音生成	[小米 MiMo](https://mimo.ai)	
Agnes AI	图片生成 + 视频生成	[Agnes AI](https://agnes-ai.com)	

---

📁 项目结构

```
mangazap/
├── backend/
│   ├── app/
│   │   ├── api/          # API 路由
│   │   │   ├── projects.py   # 项目管理
│   │   │   ├── voice.py      # MiMo TTS 语音
│   │   │   └── video.py      # Agnes AI 视频
│   │   ├── models/       # Pydantic 数据模型
│   │   ├── services/     # 业务逻辑
│   │   └── main.py       # FastAPI 入口
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # React 组件
│   │   ├── hooks/        # 自定义 Hooks
│   │   ├── services/     # API 调用
│   │   └── pages/        # 页面
│   └── package.json
└── README.md
```

---

🎯 使用流程

1. 输入想法 — 描述你想创作的漫画故事
2. AI 引导 — 回答 8 个问题，完善剧本
3. 确认剧本 — 查看并编辑生成的剧本
4. 生成关键元素 — AI 提取角色和场景
5. 生成图片 — 角色形象 + 关键帧图片
6. 生成语音 — 为角色分配音色，生成对话
7. 生成视频 — 图片动画化 + 语音合成
8. 导出视频 — 下载最终漫改短视频

---

⚠️ 已知限制

限制	说明	
MiMo 音色	目前仅支持 3 个预置音色（冰糖/白桦/苏打）	
视频时长	Agnes AI 单段最长约 18 秒	
生成时间	视频生成约 2-5 分钟/段	
并发限制	建议顺序生成，避免并发过多	

---

🤝 贡献

欢迎提交 Issue 和 PR！

---

📄 许可证

MIT License
