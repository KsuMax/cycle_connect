import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #F4632A 0%, #7C5CFC 100%)",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="22" r="7" fill="none" stroke="#ffffff" strokeWidth="2" />
          <circle cx="24" cy="22" r="7" fill="none" stroke="#ffffff" strokeWidth="2" />
          <circle cx="8" cy="22" r="1.5" fill="#ffffff" />
          <circle cx="24" cy="22" r="1.5" fill="#ffffff" />
          <line x1="8" y1="22" x2="15" y2="22" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="8" y1="22" x2="13" y2="11" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="15" y1="22" x2="13" y2="11" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="13" y1="11" x2="22" y2="11" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="15" y1="22" x2="22" y2="11" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="22" y1="11" x2="24" y2="22" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="11" y1="9" x2="15" y2="9" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="21" y1="9" x2="25" y2="9" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
