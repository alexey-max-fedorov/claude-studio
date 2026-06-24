export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label onClick={() => onChange(!value)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", cursor: "pointer" }}>
      <span style={{ color: "#a0a0a0", fontSize: 13 }}>{label}</span>
      <span
        style={{
          width: 36, height: 20, borderRadius: 10, padding: 2, transition: "background 200ms",
          background: value ? "#c9a84c" : "#1a1a1a", display: "inline-flex",
          justifyContent: value ? "flex-end" : "flex-start",
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#000" }} />
      </span>
    </label>
  )
}
