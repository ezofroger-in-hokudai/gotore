export async function prepareAvatar(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("JPEG・PNG・WebPの画像を選んでください。");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("10MB以下の画像を選んでください。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("この端末で画像を準備できません。");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 256, 256);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("画像を準備できません。"))),
        "image/jpeg",
        0.85,
      );
    });
  } catch (error) {
    throw error instanceof Error && error.message.includes("画像")
      ? error
      : new Error("画像を読み込めません。別の画像を選んでください。");
  } finally {
    URL.revokeObjectURL(url);
  }
}
