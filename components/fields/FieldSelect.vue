<script setup lang="ts">
/**
 * Native `<select>` with the same label/error envelope as `FieldText`.
 *
 * Options may have `null` values (used as a "Otro" / placeholder marker in
 * the legacy debi-forms config). Empty string is reserved for "not chosen
 * yet" — the placeholder option uses it and must stay enabled so browsers
 * display it instead of auto-selecting the first real option.
 */
import type { Option } from "~/data/argentina";

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null;
    label: string;
    options: ReadonlyArray<Option | { label: string; value: string | number | null; disabled?: boolean }>;
    placeholder?: string;
    helper?: string;
    error?: string | null;
    required?: boolean;
    disabled?: boolean;
    halfWidth?: boolean;
  }>(),
  {
    placeholder: "Seleccioná una opción",
    helper: "",
    error: null,
    required: false,
    disabled: false,
    halfWidth: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string | number | null];
}>();

const inputId = `s-${Math.random().toString(36).slice(2, 10)}`;

function onChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  // We need to find the option object to preserve its native type — Vue's
  // native select can't easily carry `null` or `number` values through the
  // DOM string layer. We use the option index to recover the original.
  const idx = target.selectedIndex - (hasPlaceholder.value ? 1 : 0);
  if (idx < 0) {
    emit("update:modelValue", "");
    return;
  }
  const opt = props.options[idx];
  emit("update:modelValue", opt?.value ?? null);
}

const hasPlaceholder = computed(
  () => props.modelValue === "" || props.modelValue == null,
);
</script>

<template>
  <div :class="['flex flex-col gap-1.5', halfWidth && 'sm:col-span-1']">
    <label
      :for="inputId"
      class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>
    <select
      :id="inputId"
      :value="modelValue ?? ''"
      :disabled="disabled"
      :aria-invalid="!!error || undefined"
      :aria-describedby="error ? `${inputId}-error` : undefined"
      class="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60 sm:text-sm"
      @change="onChange"
    >
      <option v-if="hasPlaceholder" value="">{{ placeholder }}</option>
      <option
        v-for="(opt, i) in options"
        :key="i"
        :value="opt.value ?? ''"
        :disabled="'disabled' in opt ? !!opt.disabled : false"
      >
        {{ opt.label }}
      </option>
    </select>
    <p
      v-if="helper && !error"
      class="text-xs leading-relaxed text-muted-foreground"
    >
      {{ helper }}
    </p>
    <p
      v-if="error"
      :id="`${inputId}-error`"
      class="text-xs text-red-600"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>
