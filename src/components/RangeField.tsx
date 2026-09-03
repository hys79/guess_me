"use client";

interface RangeFieldProps {
  /** 비우면 왼쪽 라벨을 렌더링하지 않는다 (숫자 입력만 오른쪽에 표시) */
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/** 파란색 포인트 컬러 슬라이더 + 숫자 입력 */
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  onChange,
}: RangeFieldProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="mb-2 flex items-baseline justify-between">
        {label ? (
          <label className="text-sm font-medium text-slate-700">{label}</label>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm
                       focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onChange(clamp(n));
            }}
          />
          {unit ? (
            <span className="text-sm text-slate-400">{unit}</span>
          ) : null}
        </div>
      </div>
      <input
        type="range"
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-primary-100
                   accent-primary-600 disabled:cursor-not-allowed"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}
