"""墨剪本地听写：faster-whisper，输出 JSON {text, words, segments}。
用法：python asr.py audio.wav --lang zh --model small
安装：pip install faster-whisper
"""
import argparse, json, os, sys

ap = argparse.ArgumentParser()
ap.add_argument("audio")
ap.add_argument("--lang", default="zh")
ap.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small"))
a = ap.parse_args()
from faster_whisper import WhisperModel  # noqa: E402

m = WhisperModel(a.model, device="auto", compute_type="int8")
segs, info = m.transcribe(a.audio, language=None if a.lang == "auto" else a.lang, word_timestamps=True, vad_filter=False,
                          initial_prompt="以下是普通话的句子。" if a.lang == "zh" else None)
words, segments, text = [], [], []
for s in segs:
    segments.append({"text": s.text.strip(), "t0": round(s.start, 3), "t1": round(s.end, 3)})
    text.append(s.text.strip())
    for w in (s.words or []):
        words.append({"w": w.word.strip(), "t0": round(w.start, 3), "t1": round(w.end, 3)})
sys.stdout.write(json.dumps({"text": "".join(text) if a.lang in ("zh", "ja") else " ".join(text), "words": words, "segments": segments, "lang": info.language}, ensure_ascii=False))
