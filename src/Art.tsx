import { useState } from "react";
import assets from "./photo-assets.json";

export type PhotoAsset = {
  src: string;
  author: string;
  license: string;
  licenseUrl: string;
  page: string;
  title: string;
  position?: string;
};
export const photoAssets = assets as Record<string, PhotoAsset>;

/** A product-specific photo overrides the shared category reference. */
export function productPhoto(kind: string, productId?: string) {
  return (productId && photoAssets[productId]) || photoAssets[kind];
}

export function Landscape({ kind = "tent" }: { kind?: string }) {
  const photo = productPhoto(kind);
  return photo ? (
    <img className="hero-photo" src={photo.src} alt="生活场景摄影参考" />
  ) : null;
}

export function ProductArt({
  kind,
  productId,
  name,
  className = "",
}: {
  kind: string;
  productId?: string;
  name?: string;
  color?: string;
  className?: string;
}) {
  const photo = productPhoto(kind, productId);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className={`photo-frame ${className}`}>
      {photo && failedSrc !== photo.src ? (
        <img
          src={photo.src}
          alt={`${name || kind} · 类别摄影参考`}
          title={`${photo.author} · ${photo.license}`}
          style={{ objectPosition: photo.position }}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(photo.src)}
        />
      ) : (
        <span
          className="photo-unavailable"
          role="img"
          aria-label={`${name || kind} 暂无照片`}
        >
          照片暂不可用
        </span>
      )}
    </div>
  );
}
