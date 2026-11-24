import { useState } from "react";

/** Shows /avatars/<id>.png if it exists (drop Runware portraits there), else colored initials. */
export default function Avatar({ id, name, color, size = 40, ring = false }: {
  id: string;
  name: string;
  color: string;
  size?: number;
  ring?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.36,
        boxShadow: ring ? `0 0 0 3px #fff, 0 0 0 5px ${color}33` : undefined,
      }}
      aria-label={name}
    >
      {!failed ? (
        <img
          src={`/avatars/${id}.png`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
      <span aria-hidden>{initials}</span>
    </span>
  );
}
