"""DevaForm — free AI 3D generation front-end.

Generates a candidate mesh from a reference image using a genuinely free
provider, then hands off to the standard ingestion pipeline. This tool is
deliberately decoupled from the renderer: its only output is a GLB file that
``pnpm ingest-asset`` consumes exactly like an artist delivery.

    pnpm ai:generate-head -- --provider triposr --ref tools/ai3d/refs/classic-head-bust.png

Requirements: Python 3.10+ and ``pip install gradio_client``.

Providers (all called through their public Hugging Face Space APIs; verified
2026-09-12):

  triposr   stabilityai/TripoSR    MIT model (code + weights). Dedicated
            hardware — no GPU quota, works anonymously. Fast (~40 s) but
            coarse: good for silhouette drafts, below statue quality.
  triposg   VAST-AI/TripoSG        MIT model. ZeroGPU — anonymous calls are
            quota-limited per IP per day; a free Hugging Face account token
            in the HF_TOKEN environment variable lifts the limit.
  trellis2  microsoft/TRELLIS.2    MIT model, best geometry + PBR textures.
            ZeroGPU — the 1024/512 jobs request more GPU time than the
            anonymous allowance, so HF_TOKEN is effectively required.

HF_TOKEN is read from the environment only. Never write it to disk and never
commit it.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import time

try:
    from gradio_client import Client, handle_file
except ImportError:  # pragma: no cover
    sys.exit("gradio_client is not installed — run: pip install gradio_client")


def read_stored_hf_token() -> str | None:
    """Fall back to the token `hf auth login` stores (never committed)."""
    for candidate in (
        os.path.join(os.environ.get("HF_HOME", ""), "token"),
        os.path.expanduser("~/.cache/huggingface/token"),
        os.path.expanduser("~/.huggingface/token"),
    ):
        try:
            with open(candidate, encoding="utf-8") as handle:
                token = handle.read().strip()
                if token:
                    return token
        except OSError:
            continue
    return None


def save_outputs(result, out_dir: str, tag: str) -> list[str]:
    saved = []
    items = result if isinstance(result, (list, tuple)) else [result]
    for index, item in enumerate(items):
        path = item.get("path") if isinstance(item, dict) else item
        if isinstance(path, str) and os.path.exists(path) and path.lower().endswith((".glb", ".obj")):
            target = os.path.join(out_dir, f"{tag}-{index}{os.path.splitext(path)[1]}")
            shutil.copy(path, target)
            print(f"saved {target} ({os.path.getsize(target):,} bytes)", flush=True)
            saved.append(target)
    return saved


def generate_triposr(client: Client, ref: str, args) -> list[str]:
    pre = client.predict(handle_file(ref), True, args.foreground_ratio, api_name="/preprocess")
    processed = pre.get("path") if isinstance(pre, dict) else pre
    print("preprocessed", flush=True)
    result = client.predict(handle_file(processed), 256, api_name="/generate")
    return save_outputs(result, args.out, f"triposr-seed{args.seed}")


def generate_triposg(client: Client, ref: str, args) -> list[str]:
    try:
        client.predict(api_name="/start_session")
    except Exception:
        pass
    seg = client.predict(image=handle_file(ref), api_name="/run_segmentation")
    processed = seg.get("path") if isinstance(seg, dict) else seg
    print("segmented", flush=True)
    result = client.predict(
        image=handle_file(processed),
        seed=args.seed,
        num_inference_steps=50,
        guidance_scale=7.0,
        simplify=True,
        target_face_num=80000,
        api_name="/image_to_3d",
    )
    return save_outputs(result, args.out, f"triposg-seed{args.seed}")


def generate_trellis2(client: Client, ref: str, args) -> list[str]:
    try:
        client.predict(api_name="/start_session")
    except Exception:
        pass
    pre = client.predict(input=handle_file(ref), api_name="/preprocess_image")
    processed = pre.get("path") if isinstance(pre, dict) else pre
    print("preprocessed", flush=True)
    client.predict(
        image=handle_file(processed),
        seed=args.seed,
        resolution=args.resolution,
        ss_guidance_strength=7.5, ss_guidance_rescale=0.7, ss_sampling_steps=12, ss_rescale_t=5.0,
        shape_slat_guidance_strength=7.5, shape_slat_guidance_rescale=0.5,
        shape_slat_sampling_steps=12, shape_slat_rescale_t=3.0,
        tex_slat_guidance_strength=1.0, tex_slat_guidance_rescale=0.0,
        tex_slat_sampling_steps=12, tex_slat_rescale_t=3.0,
        api_name="/image_to_3d",
    )
    print("generated — extracting GLB", flush=True)
    result = client.predict(decimation_target=args.decimate, texture_size=args.texture_size,
                            api_name="/extract_glb")
    return save_outputs(result, args.out, f"trellis2-seed{args.seed}")


PROVIDERS = {
    "triposr": ("stabilityai/TripoSR", generate_triposr),
    "triposg": ("VAST-AI/TripoSG", generate_triposg),
    "trellis2": ("microsoft/TRELLIS.2", generate_trellis2),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--provider", choices=sorted(PROVIDERS), default="triposr")
    parser.add_argument("--ref", default="tools/ai3d/refs/classic-head-bust.png")
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--out", default="tools/ai3d/out")
    parser.add_argument("--resolution", choices=["512", "1024", "1536"], default="1024",
                        help="trellis2 voxel resolution")
    parser.add_argument("--foreground-ratio", type=float, default=0.85, help="triposr framing")
    parser.add_argument("--decimate", type=int, default=100000,
                        help="trellis2 GLB decimation target (space minimum: 100000)")
    parser.add_argument("--texture-size", type=int, default=1024, help="trellis2 baked texture size")
    args = parser.parse_args()

    space, generate = PROVIDERS[args.provider]
    token = os.environ.get("HF_TOKEN") or read_stored_hf_token()
    os.makedirs(args.out, exist_ok=True)
    print(f"provider={args.provider} space={space} ref={args.ref} seed={args.seed} "
          f"({'authenticated' if token else 'anonymous'})", flush=True)

    started = time.time()
    client = Client(space, token=token, verbose=False)
    try:
        saved = generate(client, args.ref, args)
    except Exception as error:  # surface quota errors honestly, no retry magic
        message = str(error)
        if "ZeroGPU quota" in message:
            print("GPU quota exhausted for anonymous access. Set HF_TOKEN "
                  "(free Hugging Face account) or retry after the daily reset.", file=sys.stderr)
        print(f"generation failed: {message[:300]}", file=sys.stderr)
        return 1
    if not saved:
        print("provider returned no mesh files", file=sys.stderr)
        return 1
    print(f"done in {time.time() - started:.0f}s — next:\n"
          f"  pnpm ingest-asset {saved[0]} --id ganesha.head.classic --version <next> "
          f"--name \"Classic Head\" --joint head --slot head --source ai --provider {args.provider}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
