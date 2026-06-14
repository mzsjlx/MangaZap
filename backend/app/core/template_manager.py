import hashlib
import hmac
import json
import os
import uuid
import zipfile
from pathlib import Path

SIGNING_KEY = os.getenv("MANGAZAP_SIGNING_KEY", "change-this-in-production")
SIGNATURE_ALGO = "SHA256-HMAC"


class TemplateManager:
    def __init__(self, template_dir: str = "data/templates"):
        self.template_dir = Path(template_dir)
        self.template_dir.mkdir(parents=True, exist_ok=True)
        self._registry: dict[str, dict] = {}
        self._load_registry()

    def _load_registry(self):
        registry_path = self.template_dir / "registry.json"
        if registry_path.exists():
            with open(registry_path, "r", encoding="utf-8") as f:
                self._registry = json.load(f)

    def _save_registry(self):
        registry_path = self.template_dir / "registry.json"
        with open(registry_path, "w", encoding="utf-8") as f:
            json.dump(self._registry, f, ensure_ascii=False, indent=2)

    def _compute_checksum(self, data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    def _sign_content(self, content: bytes) -> str:
        return hashlib.sha256(content + SIGNING_KEY.encode()).hexdigest()

    def _verify_signature(self, content: bytes, signature: str) -> bool:
        expected = self._sign_content(content)
        return hmac.compare_digest(expected, signature)

    def create_template(
        self,
        name: str,
        description: str,
        source_files: list[str],
        author: str = "user",
        is_official: bool = False,
    ) -> dict:
        template_id = uuid.uuid4().hex[:12]
        template_meta = {
            "id": template_id,
            "name": name,
            "description": description,
            "author": author,
            "is_official": is_official,
            "files": source_files,
        }

        content = json.dumps(template_meta, ensure_ascii=False).encode("utf-8")
        signature = self._sign_content(content)

        template_data = {
            **template_meta,
            "signature": signature,
            "signature_algo": SIGNATURE_ALGO,
            "checksum": self._compute_checksum(content),
            "signature_warning": "Toy-level signature, used only for marking source. Integrity relies on HTTPS.",
        }

        self._registry[template_id] = template_data
        self._save_registry()

        return template_data

    def export_template(self, template_id: str, output_dir: str = "data/templates") -> dict:
        if template_id not in self._registry:
            raise ValueError(f"Template '{template_id}' not found")

        meta = self._registry[template_id]
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        flova_path = output_path / f"{template_id}.flova"
        sig_path = output_path / f"{template_id}.flova.sig"
        checksum_path = output_path / f"{template_id}.checksum.txt"

        content = json.dumps(meta, ensure_ascii=False).encode("utf-8")
        signature = self._sign_content(content)
        checksum = self._compute_checksum(content)

        with zipfile.ZipFile(flova_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("template.json", content.decode("utf-8"))
            zf.writestr("manifest.json", json.dumps({
                "version": "1.0",
                "format": "flova",
                "id": template_id,
                "name": meta["name"],
                "is_official": meta.get("is_official", False),
            }, indent=2))

        with open(sig_path, "w") as f:
            f.write(signature)

        with open(checksum_path, "w") as f:
            f.write(f"{checksum}  {flova_path.name}\n")

        return {
            "flova_path": str(flova_path),
            "sig_path": str(sig_path),
            "checksum_path": str(checksum_path),
            "signature": signature,
            "checksum": checksum,
        }

    def import_template(self, flova_path: str, sig_path: str | None = None) -> dict:
        flova_file = Path(flova_path)
        if not flova_file.exists():
            raise FileNotFoundError(f"File not found: {flova_path}")

        with zipfile.ZipFile(flova_file, "r") as zf:
            if "template.json" not in zf.namelist():
                raise ValueError("Invalid .flova file: missing template.json")

            template_content = zf.read("template.json")
            meta = json.loads(template_content)

        if "id" not in meta:
            meta["id"] = uuid.uuid4().hex[:12]

        is_official = meta.get("is_official", False)

        file_checksum = self._compute_checksum(template_content)

        signature_valid = False
        checksum_valid = True

        if sig_path:
            sig_file = Path(sig_path)
            if sig_file.exists():
                with open(sig_file, "r") as f:
                    declared_signature = f.read().strip()
                signature_valid = self._verify_signature(template_content, declared_signature)
            else:
                sig_alternate = flova_file.with_suffix(".flova.sig")
                if sig_alternate.exists():
                    with open(sig_alternate, "r") as f:
                        declared_signature = f.read().strip()
                    signature_valid = self._verify_signature(template_content, declared_signature)
        else:
            sig_alternate = flova_file.with_suffix(".flova.sig")
            if sig_alternate.exists():
                with open(sig_alternate, "r") as f:
                    declared_signature = f.read().strip()
                signature_valid = self._verify_signature(template_content, declared_signature)

        new_signature = self._sign_content(template_content)

        meta["signature"] = new_signature
        meta["signature_algo"] = SIGNATURE_ALGO
        meta["checksum"] = file_checksum
        meta["imported"] = True
        meta["signature_valid"] = signature_valid
        meta["checksum_valid"] = checksum_valid
        meta["signature_warning"] = "Toy-level signature, used only for marking source. Integrity relies on HTTPS."

        self._registry[meta["id"]] = meta
        self._save_registry()

        return {
            "template": meta,
            "signature_valid": signature_valid,
            "checksum_valid": checksum_valid,
            "is_official": is_official,
            "warning": not signature_valid and is_official,
        }

    def get_template(self, template_id: str) -> dict | None:
        return self._registry.get(template_id)

    def list_templates(self) -> list[dict]:
        return list(self._registry.values())

    def delete_template(self, template_id: str) -> bool:
        if template_id in self._registry:
            del self._registry[template_id]
            self._save_registry()
            return True
        return False


template_manager = TemplateManager()
