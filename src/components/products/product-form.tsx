"use client";

import { useState } from "react";
import { ApiNotice } from "../api-notice";
import { Button } from "../ui/button";
import { ClientApiError, apiFetch } from "@/lib/client-api";
import { FIELD_LIMITS } from "@/lib/limits";

export type ProductFormValues = {
  name: string;
  activeSubstance: string;
  category: string;
  useFor: string;
  howToUse: string;
  tip: string;
};

const EMPTY: ProductFormValues = { name: "", activeSubstance: "", category: "", useFor: "", howToUse: "", tip: "" };

const FIELDS: { key: keyof ProductFormValues; label: string; max: number; multiline?: boolean; required: boolean }[] = [
  { key: "name", label: "Product name", max: FIELD_LIMITS.productName, required: true },
  { key: "activeSubstance", label: "Active substance", max: FIELD_LIMITS.activeSubstance, required: true },
  { key: "category", label: "Category", max: FIELD_LIMITS.category, required: true },
  { key: "useFor", label: "Use for", max: FIELD_LIMITS.useFor, required: true },
  { key: "howToUse", label: "How to use", max: FIELD_LIMITS.howToUse, multiline: true, required: true },
  { key: "tip", label: "Tip", max: FIELD_LIMITS.tip, multiline: true, required: false },
];

/** Add/edit form for a custom product. Server-side validation errors are shown per field. */
export function ProductForm({
  productId,
  initial,
  onSaved,
  onCancel,
}: {
  productId: string | null;
  initial?: ProductFormValues;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ProductFormValues>(initial ?? EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await apiFetch(productId ? `/api/products/${productId}` : "/api/products", {
        method: productId ? "PUT" : "POST",
        body: values,
      });
      onSaved();
    } catch (e) {
      if (e instanceof ClientApiError && e.fields) setFieldErrors(e.fields);
      else setError(e instanceof ClientApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <h3 className="text-sm font-semibold text-slate-900">{productId ? "Edit product" : "Add a product"}</h3>
      {FIELDS.map(({ key, label, max, multiline, required }) => {
        const id = `product-${key}`;
        const err = fieldErrors[key];
        const common = {
          id,
          value: values[key],
          maxLength: max + 50, // allow typing past the limit so the friendly message can explain it
          "aria-invalid": err ? true : undefined,
          "aria-describedby": err ? `${id}-error` : undefined,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setValues((v) => ({ ...v, [key]: e.target.value })),
          className: `mt-1 w-full rounded-lg border px-3 py-2 text-base text-slate-900 md:text-sm ${err ? "border-red-400" : "border-slate-300"}`,
        };
        return (
          <div key={key}>
            <label htmlFor={id} className="text-sm font-medium text-slate-800">
              {label}
              {required ? <span aria-hidden> *</span> : <span className="font-normal text-slate-500"> (optional)</span>}
            </label>
            {multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />}
            {err && (
              <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-700">
                {err}
              </p>
            )}
          </div>
        );
      })}
      {error && <ApiNotice message={error} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : productId ? "Save changes" : "Add product"}
        </Button>
      </div>
    </form>
  );
}
