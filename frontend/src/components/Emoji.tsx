import { useState } from "react";

/** Microsoft Fluent 3D emoji (MIT) from jsDelivr; falls back to the system emoji offline. */
const BASE = "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/";
const FLUENT: Record<string, string> = {
  "❤️": "Red%20heart/3D/red_heart_3d.png",
  "🔥": "Fire/3D/fire_3d.png",
  "😂": "Face%20with%20tears%20of%20joy/3D/face_with_tears_of_joy_3d.png",
  "😴": "Sleeping%20face/3D/sleeping_face_3d.png",
  "🤔": "Thinking%20face/3D/thinking_face_3d.png",
  "😬": "Grimacing%20face/3D/grimacing_face_3d.png",
  "👀": "Eyes/3D/eyes_3d.png",
  "🤯": "Exploding%20head/3D/exploding_head_3d.png",
  "📣": "Megaphone/3D/megaphone_3d.png",
  "🙅": "Cross%20mark/3D/cross_mark_3d.png",
};

export default function Emoji({ char, size = 24 }: { char: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const path = FLUENT[char];
  if (!path || failed) return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{char}</span>;
  return <img src={BASE + path} alt={char} width={size} height={size} draggable={false} onError={() => setFailed(true)} />;
}
