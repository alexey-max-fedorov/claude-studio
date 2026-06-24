export function NumberField({
  label, value, step = 1, min = 0, onChange,
}: { label: string; value: number; step?: number; min?: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <span style={{ color: "#a0a0a0", fontSize: 13 }}>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: 72, background: "#111", color: "#fff", border: "1px solid #1a1a1a",
          borderRadius: 6, padding: "4px 8px", fontSize: 13, textAlign: "right",
        }}
      />
    </label>
  )
}
