"""One-command launcher: python run.py
Creates a virtual environment (.venv), installs requirements, then starts FlightPath
and opens it in your browser. Options: --test (run unit tests only), --port N, --no-browser."""
import argparse, os, shutil, subprocess, sys, threading, time, venv, webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV = ROOT / ".venv"
PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

def ensure_env():
    """Return the Python executable to use (venv if possible, else the current interpreter)."""
    req = ROOT / "requirements.txt"
    try:
        if not PY.exists():
            print("Creating virtual environment...")
            venv.create(VENV, with_pip=True)
        py, stamp = str(PY), VENV / ".installed"
        if not stamp.exists() or stamp.stat().st_mtime < req.stat().st_mtime:
            print("Installing dependencies...")
            subprocess.check_call([py, "-m", "pip", "install", "-q", "-r", str(req)])
            stamp.touch()
        return py
    except Exception as e:
        print(f"Virtual environment unavailable ({e.__class__.__name__}); using current Python.")
        shutil.rmtree(VENV, ignore_errors=True)
        if subprocess.call([sys.executable, "-c", "import flask"], stderr=subprocess.DEVNULL):
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "-r", str(req)])
        return sys.executable

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true", help="run unit tests and exit")
    ap.add_argument("--port", type=int, default=5000)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    if sys.version_info < (3, 9):
        sys.exit("Python 3.9+ is required.")
    py = ensure_env()
    os.chdir(ROOT)
    if args.test:
        sys.exit(subprocess.call([py, "-m", "unittest", "discover", "-s", "tests", "-v"]))
    url = f"http://127.0.0.1:{args.port}"
    if not args.no_browser:
        threading.Thread(target=lambda: (time.sleep(1.5), webbrowser.open(url)), daemon=True).start()
    print(f"FlightPath running at {url}  (Ctrl+C to stop)")
    code = "from app import app; app.run(port=%d)" % args.port
    try:
        subprocess.call([py, "-c", code])
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
