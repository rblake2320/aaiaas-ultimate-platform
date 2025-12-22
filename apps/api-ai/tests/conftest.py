import sys
from pathlib import Path


# Ensure `apps/api-ai` is on sys.path so `import services.*` works in tests.
API_AI_DIR = Path(__file__).resolve().parents[1]
if str(API_AI_DIR) not in sys.path:
    sys.path.insert(0, str(API_AI_DIR))

