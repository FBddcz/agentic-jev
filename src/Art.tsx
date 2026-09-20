import { useId, createContext, useContext, useState } from "react";
import assets from "./photo-assets.json";
export const VisualMode = createContext<"photos" | "illustrations">("photos");
export const photoAssets = assets as Record<
  string,
  {
    src: string;
    author: string;
    license: string;
    licenseUrl: string;
    page: string;
    title: string;
  }
>;

function ProductIllustration({
  kind,
  color,
  className = "",
}: {
  kind: string;
  color: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const dark = "#3f4d42",
    light = "#f8f5e9";
  const art: Record<string, React.ReactNode> = {
    tent: (
      <>
        <path d="M38 156L135 39l106 117Z" fill={color} />
        <path d="M135 39l13 116h93Z" fill="#536647" opacity=".65" />
        <path d="M59 155l76-96 50 97Z" fill={light} />
        <path d="M88 155l48-75 30 75Z" fill="#485b42" />
        <path
          d="M38 156h206M135 39l-8-9M38 156l-12 11m215-11 11 11"
          stroke={dark}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M135 39l50 117"
          stroke="#f9f9e8"
          opacity=".7"
          strokeWidth="2"
        />
      </>
    ),
    chair: (
      <>
        <path
          d="M79 83l22 79m107-78-43 83M91 161l113-8M103 166l-21 16m84-15 28 12"
          stroke={dark}
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M85 53q50-27 101 0l-5 64q-50 44-93 2Z" fill={color} />
        <path d="M88 116q45 27 93 1l18 25q-54 34-98 1Z" fill={color} />
        <path d="M82 57l6 66m99-66-6 68" stroke={dark} strokeWidth="5" />
        <path
          d="M70 110l33 8m69-1 33-9"
          stroke="#b18858"
          strokeWidth="9"
          strokeLinecap="round"
        />
      </>
    ),
    lantern: (
      <>
        <path
          d="M106 57V42q30-46 60 0v16"
          fill="none"
          stroke={dark}
          strokeWidth="6"
        />
        <path d="M111 69h51l11 72h-73Z" fill="#fff3bf" />
        <path d="M131 78h12v55h-12Z" fill="#f8c85d" />
        <path d="M107 63l-8 77m65-77 10 78" stroke={dark} strokeWidth="5" />
        <path d="M96 143q40-20 81 0l6 18H89Z" fill={color} />
        <path d="M96 68q40-40 79 0Z" fill={color} />
        <rect x="104" y="160" width="63" height="8" rx="4" fill={dark} />
        <circle cx="135" cy="147" r="6" fill={dark} />
      </>
    ),
    bottle: (
      <>
        <rect x="107" y="39" width="63" height="17" rx="7" fill={dark} />
        <rect x="103" y="53" width="71" height="119" rx="23" fill={color} />
        <path
          d="M114 65v76q0 17 10 19"
          stroke="#fff"
          opacity=".35"
          strokeWidth="5"
          fill="none"
        />
        <path d="M105 76h67" stroke={dark} opacity=".2" />
        <text
          x="138"
          y="123"
          textAnchor="middle"
          fill={light}
          fontSize="13"
          letterSpacing="4"
        >
          OUT
        </text>
      </>
    ),
    keyboard: (
      <>
        <path
          d="M39 83l183-17 25 71-185 18Z"
          fill={color}
          stroke={dark}
          strokeWidth="2"
        />
        {Array.from({ length: 42 }, (_, i) => (
          <rect
            key={i}
            x={53 + (i % 14) * 12.2}
            y={85 + Math.floor(i / 14) * 16 - (i % 14) * 1.2}
            width="9"
            height="11"
            rx="2"
            fill={i % 7 === 0 ? dark : light}
            opacity=".9"
          />
        ))}
        <path
          d="M91 136l91-9"
          stroke={light}
          strokeWidth="10"
          strokeLinecap="round"
        />
      </>
    ),
    lamp: (
      <>
        <ellipse cx="141" cy="163" rx="48" ry="12" fill={color} />
        <path d="M141 150V90" stroke={dark} strokeWidth="8" />
        <path d="M83 93q4-80 58-77 53 0 61 77Z" fill={color} />
        <ellipse cx="142" cy="93" rx="59" ry="11" fill={light} />
        <ellipse cx="142" cy="93" rx="12" ry="5" fill="#e7ca89" />
      </>
    ),
    tray: (
      <>
        <path d="M41 107l117-45 84 46-112 55Z" fill={color} />
        <path
          d="M41 107v24l89 46v-14m0 14 112-55v-14"
          fill={color}
          stroke={dark}
          strokeOpacity=".3"
          strokeWidth="3"
        />
        <path d="M56 108l99-36 66 35-91 44Z" fill={dark} opacity=".16" />
        <path
          d="M94 107l62 30m-1-65-1 60"
          stroke={dark}
          opacity=".3"
          strokeWidth="4"
        />
      </>
    ),
    stand: (
      <>
        <path d="M113 119l-6 37 53 13 16-39Z" fill={color} />
        <path
          d="M51 64l149-17 38 71-150 28Z"
          fill={color}
          stroke={dark}
          strokeOpacity=".35"
          strokeWidth="2"
        />
        <path
          d="M79 82l105-12m-97 27 105-12m-94 27 105-12"
          stroke={dark}
          opacity=".25"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M104 156l55 14 27-9"
          fill="none"
          stroke={dark}
          strokeWidth="5"
        />
      </>
    ),
    mat: (
      <>
        <path d="M39 101l146-48 64 64-145 57Z" fill={color} />
        <path
          d="M63 95l137 48m-111-57 132 47m-110-54 119 44M87 166l143-54M65 143l143-49"
          stroke={light}
          strokeWidth="7"
          opacity=".55"
        />
      </>
    ),
    mouse: (
      <>
        <path
          d="M93 90q6-53 45-53 43 0 48 52l-2 48q-14 53-57 24-41-16-34-71Z"
          fill={color}
        />
        <path
          d="M138 39v60m-44-4 90 7"
          stroke={dark}
          opacity=".25"
          strokeWidth="2"
        />
        <rect x="132" y="58" width="11" height="24" rx="5" fill={dark} />
      </>
    ),
    speaker: (
      <>
        <rect x="69" y="60" width="142" height="104" rx="17" fill={color} />
        <rect
          x="81"
          y="71"
          width="118"
          height="81"
          rx="10"
          fill={dark}
          opacity=".76"
        />
        {Array.from({ length: 90 }, (_, i) => (
          <circle
            key={i}
            cx={91 + (i % 15) * 7}
            cy={82 + Math.floor(i / 15) * 12}
            r="1.2"
            fill={light}
            opacity=".5"
          />
        ))}
        <path d="M88 164v9m104-9v9" stroke={dark} strokeWidth="7" />
      </>
    ),
    bag: (
      <>
        <path
          d="M116 54V39q22-24 46 0v16"
          fill="none"
          stroke={dark}
          strokeWidth="8"
        />
        <path
          d="M83 73q0-24 24-25h64q25 3 25 25v88q-3 13-16 13h-80q-15 0-17-13Z"
          fill={color}
        />
        <rect
          x="99"
          y="107"
          width="82"
          height="51"
          rx="13"
          fill={dark}
          opacity=".16"
        />
        <path
          d="M107 117h63M93 90h94"
          stroke={dark}
          strokeWidth="3"
          opacity=".5"
        />
        <path
          d="M92 65q10-10 20-9"
          stroke={light}
          opacity=".5"
          strokeWidth="5"
          fill="none"
        />
        <rect x="129" y="74" width="23" height="13" rx="2" fill="#e1c69e" />
      </>
    ),
    headphones: (
      <>
        <path
          d="M82 118V83q0-56 56-56t57 56v35"
          fill="none"
          stroke={dark}
          strokeWidth="17"
        />
        <path
          d="M82 83q0-57 56-57t57 57"
          fill="none"
          stroke={color}
          strokeWidth="13"
        />
        <rect
          x="65"
          y="96"
          width="41"
          height="68"
          rx="18"
          fill={color}
          transform="rotate(-9 85 130)"
        />
        <rect
          x="175"
          y="96"
          width="41"
          height="68"
          rx="18"
          fill={color}
          transform="rotate(9 195 130)"
        />
        <path
          d="M104 119v28m69-28v28"
          stroke={dark}
          strokeWidth="8"
          strokeLinecap="round"
        />
      </>
    ),
    power: (
      <>
        <rect
          x="90"
          y="45"
          width="99"
          height="125"
          rx="20"
          fill={color}
          transform="rotate(-12 139 107)"
        />
        <path
          d="M116 39l43-9"
          stroke={dark}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M147 70l-25 41h21l-11 37 31-49h-22Z"
          fill={light}
          opacity=".8"
        />
        <circle cx="125" cy="149" r="2" fill={dark} />
      </>
    ),
    umbrella: (
      <>
        <path
          d="M139 52v102q0 29-20 16"
          fill="none"
          stroke={dark}
          strokeWidth="6"
        />
        <path
          d="M45 100q9-70 94-70t94 70q-31-20-61 0-30-20-60 0-31-20-67 0Z"
          fill={color}
        />
        <path
          d="M139 31q-20 19-27 69m27-69q30 27 33 69"
          stroke={dark}
          strokeWidth="2"
          opacity=".25"
        />
      </>
    ),
    grinder: (
      <>
        <path d="M111 76h59v83q-30 20-59 0Z" fill={color} />
        <ellipse cx="140" cy="76" rx="30" ry="9" fill={dark} />
        <path d="M140 75V54l49-7" fill="none" stroke={dark} strokeWidth="5" />
        <ellipse cx="195" cy="46" rx="15" ry="8" fill={color} />
        <path d="M113 126h55" stroke={dark} strokeWidth="3" opacity=".4" />
        <path d="M119 90v30" stroke={light} strokeWidth="5" opacity=".4" />
      </>
    ),
    kettle: (
      <>
        <path
          d="M95 105q-20-50-44-31l46 77"
          fill="none"
          stroke={color}
          strokeWidth="12"
        />
        <path
          d="M175 93q58-33 43 38l-33 17"
          fill="none"
          stroke={dark}
          strokeWidth="10"
        />
        <path d="M115 77h51l26 76q-12 27-97 0Z" fill={color} />
        <ellipse cx="140" cy="77" rx="26" ry="6" fill={dark} />
        <path
          d="M136 75V61"
          stroke={dark}
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path d="M111 142l10-50" stroke={light} opacity=".35" strokeWidth="6" />
      </>
    ),
    cup: (
      <>
        <path
          d="M172 90q60-21 37 29-10 20-35 15"
          fill="none"
          stroke={color}
          strokeWidth="13"
        />
        <path d="M79 81h104l-11 68q-43 30-84 0Z" fill={color} />
        <ellipse cx="131" cy="82" rx="52" ry="13" fill={light} />
        <ellipse cx="131" cy="83" rx="43" ry="9" fill="#795944" />
        <path
          d="M112 51q-8-11 1-22m31 22q-8-11 1-22"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </>
    ),
    scale: (
      <>
        <path d="M76 64h127l18 80-144 18-17-68Z" fill={color} />
        <path d="M89 71h103l10 51-111 14Z" fill={dark} opacity=".15" />
        <path d="M108 143l40-5" stroke={dark} strokeWidth="16" />
        <text x="118" y="146" fill={light} fontSize="9">
          0.0
        </text>
        <circle cx="175" cy="136" r="4" fill={dark} />
      </>
    ),
  };
  return (
    <svg
      className={className}
      viewBox="0 0 280 210"
      role="img"
      aria-label="原创商品示意图"
    >
      <defs>
        <filter id={uid}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <ellipse
        cx="141"
        cy="181"
        rx="74"
        ry="8"
        fill="#3b4737"
        opacity=".1"
        filter={`url(#${uid})`}
      />
      <g>{art[kind] ?? art.bag}</g>
    </svg>
  );
}
export function Landscape({ scene = "camp" }: { scene?: string }) {
  const mode = useContext(VisualMode);
  if (mode === "photos" && photoAssets.tent)
    return (
      <img
        className="hero-photo"
        src={photoAssets.tent.src}
        alt="高山草地上的真实露营场景参考"
      />
    );
  return (
    <svg
      viewBox="0 0 680 330"
      className={`landscape scene-${scene}`}
      aria-hidden="true"
    >
      <circle cx="516" cy="80" r="49" fill="#f7edc5" />
      <path d="M140 281L365 61l164 203 90-146 103 178Z" fill="#b3c398" />
      <path d="M277 151l88-90 60 76-38-12-23 20-19-22Z" fill="#e9ecdc" />
      <path d="M183 330l229-188 179 106 88-71 75 153Z" fill="#8fa881" />
      <path d="M96 331q106-98 208-51t184-2 207 52Z" fill="#607f5d" />
      <path d="M303 295l92-105 99 105Z" fill="#e2c89c" />
      <path d="M395 190l12 105h87Z" fill="#ad916a" />
      <path d="M355 295l40-83 46 83Z" fill="#425c43" />
      <path d="M281 304h235" stroke="#3e5b41" strokeWidth="3" />
      <path
        d="M557 282v-73m-33 28 33-56 34 56m-65 21 31-50 31 50"
        fill="#395a40"
        stroke="#395a40"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path
        d="M224 278v-44m-20 21 20-39 25 39"
        fill="#395a40"
        stroke="#395a40"
        strokeWidth="6"
      />
      <path
        d="M343 314q71-4 96 16"
        stroke="#cbd8b3"
        strokeWidth="14"
        fill="none"
      />
    </svg>
  );
}

export function ProductArt(props: {
  kind: string;
  color: string;
  className?: string;
}) {
  const mode = useContext(VisualMode),
    [failed, setFailed] = useState(false);
  const photo = photoAssets[props.kind];
  if (mode === "photos" && photo && !failed)
    return (
      <div className={"photo-frame " + (props.className ?? "")}>
        <img
          src={photo.src}
          alt={props.kind + " 类别的真实摄影参考"}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  return <ProductIllustration {...props} />;
}
