"use client";

import * as Slider from "@radix-ui/react-slider";
import { useEffect, useState } from "react";
import { Dialog } from "../ui/dialog";

export const SIMULATION_NOTE = "Demo simulation — no external AI model is called.";

function SettingSlider({
  label,
  value,
  onCommit,
  help,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  help: string;
}) {
  const [live, setLive] = useState(value);
  useEffect(() => setLive(value), [value]);
  const id = `slider-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div>
      <div className="flex items-center justify-between">
        <label id={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        <output aria-live="polite" className="rounded-md bg-slate-100 px-2 py-0.5 text-sm tabular-nums text-slate-700">
          {live.toFixed(1)}
        </output>
      </div>
      <Slider.Root
        className="relative mt-3 flex h-11 w-full touch-none select-none items-center"
        min={0}
        max={1}
        step={0.1}
        value={[live]}
        onValueChange={([v]) => setLive(Math.round(v * 10) / 10)}
        onValueCommit={([v]) => onCommit(Math.round(v * 10) / 10)}
      >
        <Slider.Track className="relative h-2 grow rounded-full bg-slate-200">
          <Slider.Range className="absolute h-full rounded-full bg-teal-600" />
        </Slider.Track>
        <Slider.Thumb
          aria-labelledby={id}
          className="block size-6 rounded-full border-2 border-teal-600 bg-white shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        />
      </Slider.Root>
      <p className="text-xs text-slate-500">{help}</p>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  temperature,
  topP,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  temperature: number;
  topP: number;
  onChange: (change: { temperature?: number; topP?: number }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Advanced settings" description={SIMULATION_NOTE}>
      <div className="space-y-6">
        <SettingSlider
          label="Temperature"
          value={temperature}
          onCommit={(v) => onChange({ temperature: v })}
          help="Controls the wording: 0.0–0.3 direct and concise, 0.4–0.7 balanced, 0.8–1.0 friendlier with an example."
        />
        <SettingSlider
          label="Top-P"
          value={topP}
          onCommit={(v) => onChange({ topP: v })}
          help="Controls the detail: 0.0–0.3 key facts only, 0.4–0.7 adds how to use, 0.8–1.0 adds substance and category. Safety information is always included."
        />
        <p className="text-xs text-slate-500">Settings are saved with this chat and apply to Mia’s next answer.</p>
      </div>
    </Dialog>
  );
}
