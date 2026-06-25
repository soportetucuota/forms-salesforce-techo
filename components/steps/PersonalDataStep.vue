<script setup lang="ts">
/**
 * Personal data step: name, last name, birth date, email, phone, and
 * optional country/province. Used as the first step of an alta flow.
 *
 * The step owns the live formatter for the birth-date input (DD/MM/YYYY)
 * but stores the raw display value in `modelValue.birthDate`. When the
 * parent submits, it should call `transformBirthDateToISO()` from
 * `~/composables/formatters` to get the YYYY-MM-DD value Salesforce
 * expects. This split keeps the displayed value friendly during back-nav.
 *
 * Customize copy via props (`title`, `description`) or by swapping the
 * heading block from outside (omit them and place your own `<h2>` above
 * the component).
 */
import { reactive, ref } from "vue";
import { COUNTRIES, PROVINCES } from "~/data/argentina";
import {
  isAdult,
  validateEmail,
  validateSimpleBirthDate,
} from "~/composables/validators";
import { formatBirthDateDisplay } from "~/composables/formatters";

export interface PersonalData {
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
  country: string;
  province: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: PersonalData;
    stepIndex?: number;
    title?: string;
    description?: string;
    includeBirthDate?: boolean;
    includeCountry?: boolean;
    includeProvince?: boolean;
    disabled?: boolean;
  }>(),
  {
    stepIndex: 1,
    title: "Tus datos",
    description: "Necesitamos estos datos para registrar tu donación.",
    includeBirthDate: true,
    includeCountry: true,
    includeProvince: true,
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: PersonalData];
}>();

const errors = reactive<Record<keyof PersonalData, string | null>>({
  firstName: null,
  lastName: null,
  birthDate: null,
  email: null,
  phone: null,
  country: null,
  province: null,
});

const firstInvalidRef = ref<HTMLElement | null>(null);

const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

/**
 * Live phone validation message. Returns `null` when the number is valid (or
 * still empty, so we don't nag before the user types). Mirrors the submit-time
 * rule (`validatePhoneNumber`) but adds an upper bound and digit-count hints so
 * the user sees when digits are missing or in excess while they type.
 */
function phoneError(value: string): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\s()-]/g, "");
  if (!/^\d+$/.test(cleaned)) {
    return "El celular solo puede tener números.";
  }
  if (cleaned.length < PHONE_MIN_DIGITS) {
    const missing = PHONE_MIN_DIGITS - cleaned.length;
    return `Faltan ${missing} dígito${missing === 1 ? "" : "s"} (mínimo ${PHONE_MIN_DIGITS}).`;
  }
  if (cleaned.length > PHONE_MAX_DIGITS) {
    const extra = cleaned.length - PHONE_MAX_DIGITS;
    return `Sobran ${extra} dígito${extra === 1 ? "" : "s"} (máximo ${PHONE_MAX_DIGITS}).`;
  }
  return null;
}

function update<K extends keyof PersonalData>(key: K, value: PersonalData[K]) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
  if (key === "phone") {
    errors.phone = phoneError(value as string);
  } else if (errors[key]) {
    errors[key] = null;
  }
}

async function validate() {
  for (const k of Object.keys(errors) as Array<keyof PersonalData>) {
    errors[k] = null;
  }
  const v = props.modelValue;
  const out: Record<string, string> = {};

  if (!v.firstName || !/^[\p{L}\s'-]+$/u.test(v.firstName)) {
    out.firstName = !v.firstName
      ? "Ingresá tu nombre."
      : "El nombre no debe contener números o caracteres especiales.";
  }
  if (!v.lastName || !/^[\p{L}\s'-]+$/u.test(v.lastName)) {
    out.lastName = !v.lastName
      ? "Ingresá tu apellido."
      : "El apellido no debe contener números o caracteres especiales.";
  }
  if (props.includeBirthDate) {
    const r = validateSimpleBirthDate(v.birthDate);
    if (!r.valid) out.birthDate = r.message;
    else if (!isAdult(v.birthDate)) out.birthDate = "Debés ser mayor de edad.";
  }
  if (!v.email) out.email = "Ingresá tu email.";
  else if (!validateEmail(v.email)) out.email = "Ingresá un email válido.";
  if (!v.phone) out.phone = "Ingresá tu celular (con código de área).";
  else {
    const phoneMsg = phoneError(v.phone);
    if (phoneMsg) out.phone = phoneMsg;
  }
  if (props.includeCountry && !v.country) out.country = "Elegí tu país.";
  if (props.includeProvince && !v.province)
    out.province = "Elegí tu provincia.";

  for (const [k, msg] of Object.entries(out)) {
    errors[k as keyof PersonalData] = msg;
  }

  return { ok: Object.keys(out).length === 0, errors: out };
}

useFlowStep({
  stepIndex: props.stepIndex,
  validate,
  focus: () => firstInvalidRef.value?.focus?.(),
});

defineExpose({ validate });
</script>

<template>
  <section class="space-y-3" :aria-disabled="disabled || undefined">
    <header class="space-y-1">
      <h2 class="text-sm font-semibold text-foreground">{{ title }}</h2>
      <p class="text-sm leading-relaxed text-muted-foreground">
        {{ description }}
      </p>
    </header>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FieldText
        :model-value="modelValue.firstName"
        label="Nombre"
        autocomplete="given-name"
        required
        half-width
        :error="errors.firstName"
        :disabled="disabled"
        @update:model-value="(v: string) => update('firstName', v)"
      />
      <FieldText
        :model-value="modelValue.lastName"
        label="Apellido"
        autocomplete="family-name"
        required
        half-width
        :error="errors.lastName"
        :disabled="disabled"
        @update:model-value="(v: string) => update('lastName', v)"
      />

      <FieldText
        v-if="includeBirthDate"
        :model-value="modelValue.birthDate"
        label="Fecha de nacimiento"
        placeholder="DD/MM/AAAA"
        :maxlength="10"
        :formatter="formatBirthDateDisplay"
        inputmode="numeric"
        autocomplete="bday"
        required
        half-width
        :error="errors.birthDate"
        :disabled="disabled"
        @update:model-value="(v: string) => update('birthDate', v)"
      />
      <FieldText
        :model-value="modelValue.email"
        label="Email"
        type="email"
        autocomplete="email"
        required
        half-width
        :error="errors.email"
        :disabled="disabled"
        @update:model-value="(v: string) => update('email', v)"
      />

      <FieldText
        :model-value="modelValue.phone"
        label="Celular (con código de área)"
        type="tel"
        autocomplete="tel"
        inputmode="tel"
        required
        half-width
        :error="errors.phone"
        :disabled="disabled"
        @update:model-value="(v: string) => update('phone', v)"
      />

      <FieldSelect
        v-if="includeCountry"
        :model-value="modelValue.country"
        label="País"
        placeholder="Seleccioná tu país"
        :options="COUNTRIES"
        required
        half-width
        :error="errors.country"
        :disabled="disabled"
        @update:model-value="(v: string | number | null) => update('country', String(v ?? ''))"
      />

      <FieldSelect
        v-if="includeProvince"
        :model-value="modelValue.province"
        label="Provincia"
        placeholder="Seleccioná tu provincia"
        :options="PROVINCES"
        required
        half-width
        :error="errors.province"
        :disabled="disabled"
        @update:model-value="(v: string | number | null) => update('province', String(v ?? ''))"
      />
    </div>
  </section>
</template>
