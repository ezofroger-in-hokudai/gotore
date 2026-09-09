from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

from app.domain.avatar import AVATAR_SIZE, MAX_IMAGE_PIXELS, MAX_STORED_BYTES


def normalize_avatar(content: bytes) -> bytes:
    try:
        with Image.open(BytesIO(content), formats=["JPEG", "PNG", "WEBP"]) as source:
            if source.width * source.height > MAX_IMAGE_PIXELS or getattr(
                source, "is_animated", False
            ):
                raise ValueError("画像は静止画・400万画素以下で送信してください")
            source.load()
            image = ImageOps.fit(
                ImageOps.exif_transpose(source).convert("RGB"),
                (AVATAR_SIZE, AVATAR_SIZE),
                method=Image.Resampling.LANCZOS,
            )
            # 新しい画像へ画素だけをコピーし、位置情報などのメタデータを持ち越さない。
            clean = Image.new("RGB", image.size)
            clean.paste(image)
            output = BytesIO()
            clean.save(output, format="JPEG", quality=85, optimize=True)
            result = output.getvalue()
            if len(result) > MAX_STORED_BYTES:
                raise ValueError("画像を小さくして再試行してください")
            return result
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError("読み込めるJPEG・PNG・WebP画像を選んでください") from error
