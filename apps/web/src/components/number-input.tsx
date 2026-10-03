import { Input } from "@orpc-tauri/ui/components/input";
import { Label } from "@orpc-tauri/ui/components/label";

interface NumberInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
}

export function NumberInput({ id, label, value, onChange, placeholder = "0", min = 1 }: NumberInputProps) {
  const handleDecrement = () => {
    const current = Number(value || min);
    onChange(String(Math.max(min, current - 1)));
  };

  const handleIncrement = () => {
    const current = Number(value || 0);
    onChange(String(current + 1));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    onChange(val);
  };

  return (
    <div>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className="font-mono bg-input border-primary/30 pr-16"
        />
        <div className="absolute right-1 top-1 bottom-1 flex gap-1">
          <button
            type="button"
            onClick={handleDecrement}
            className="w-7 flex items-center justify-center bg-card border border-primary/30 hover:border-primary/60 hover:bg-primary/10 rounded text-primary transition-all glow-hover"
          >
            <span className="text-lg leading-none">−</span>
          </button>
          <button
            type="button"
            onClick={handleIncrement}
            className="w-7 flex items-center justify-center bg-card border border-primary/30 hover:border-primary/60 hover:bg-primary/10 rounded text-primary transition-all glow-hover"
          >
            <span className="text-lg leading-none">+</span>
          </button>
        </div>
      </div>
    </div>
  );
}
