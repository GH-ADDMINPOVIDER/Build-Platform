# WAVE Architecture Exhibition Embed

Purpose: display the architecture as an **exhibition/read-only surface**, not as an execution control.

Recommended embed:

```html
<section aria-labelledby="ogenic-architecture-title">
  <h2 id="ogenic-architecture-title">OGENIC / WAVE Architecture</h2>
  <div class="architecture-pan">
    <img
      src="/architecture/oge-system-map.svg"
      alt="OGENIC WAVE architecture from WAVE through ATHENA, Yellow, CCS, Violet, Ruby and Green 1LSS"
      width="1800"
      height="900"
      loading="lazy"
    />
  </div>
</section>
```

```css
.architecture-pan {
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  -webkit-overflow-scrolling: touch;
}
.architecture-pan img {
  display: block;
  width: max(1100px, 100%);
  height: auto;
}
```

Rules:
- read-only
- no secrets or internal token values
- no production controls
- preserve horizontal pan on mobile rather than shrinking labels into unreadability
- SVG is grayscale by default
