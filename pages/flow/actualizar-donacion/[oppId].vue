<script setup lang="ts">
/**
 * Flow: "actualizar-donacion"
 *
 * Link de autoservicio que la org envía por mail a donantes existentes.
 * Pre-carga la Opportunity por `oppId` y permite actualizar el monto
 * y/o guardar un nuevo método de pago. Ambos campos son independientes:
 * dejar el área de pago vacía significa "solo actualizar monto".
 *
 * URL: /flow/actualizar-donacion/<id-de-oportunidad>
 *
 * Estructura:
 *   - 1 paso visible (sin wizard chrome)
 *   - AmountStep (monto libre, sin presets, sin frecuencia)
 *   - PaymentMethodStep (no requerido — `:required="false"`)
 *
 * Si querés convertirlo en un wizard de 2 pasos, reemplazá el layout
 * inline con `<MultiStepFlow :steps="2">` y dividí los children en
 * slots `#step-1` y `#step-2`.
 */
import { computed, onMounted, ref } from "vue";
import type { FlowRecord } from "~/server/utils/salesforce";
import AmountStep from "~/components/steps/AmountStep.vue";
import PaymentMethodStep from "~/components/steps/PaymentMethodStep.vue";
import type { AmountData } from "~/components/steps/AmountStep.vue";
import type { PaymentData } from "~/components/steps/PaymentMethodStep.vue";
import { formatAmountEsAR } from "~/composables/formatters";

definePageMeta({
  flowTitle: "Actualizar donación (autoservicio)",
  flowDescription:
    "Link que la org manda por mail a un donante para que cambie monto y/o método de pago. Requiere un Id de Oportunidad real de Salesforce en la URL.",
});

useHead({ title: "Actualizá tu donación" });

const route = useRoute();
const oppId = computed(() => String(route.params.oppId));

const amountStepRef = ref<InstanceType<typeof AmountStep> | null>(null);
const paymentStepRef = ref<InstanceType<typeof PaymentMethodStep> | null>(null);

const isLoading = ref(true);
const isSubmitting = ref(false);
const record = ref<FlowRecord | null>(null);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const amount = ref<AmountData>({ value: null, frequency: "" });
const payment = ref<PaymentData>({ token: null });

const previousQuota = computed(() => {
  const r = record.value;
  if (!r) return null;
  return r.recurringAmount ?? r.opportunityAmount ?? null;
});

const previousQuotaText = computed(() => {
  const q = previousQuota.value;
  if (q == null) return "";
  return formatAmountEsAR(q);
});

const canSavePaymentMethod = computed(
  () => record.value?.opportunityContactId != null,
);

async function load() {
  isLoading.value = true;
  errorMessage.value = null;
  successMessage.value = null;
  try {
    const json = await $fetch<{
      error: boolean;
      message?: string;
      data?: FlowRecord;
    }>(`/api/flow/actualizar-donacion/${oppId.value}`, {
      cache: "no-store",
    });
    if (json.error || !json.data) {
      throw new Error(
        json.message ||
          "No pudimos cargar tu información. Probá de nuevo en unos minutos.",
      );
    }
    record.value = json.data;
    amount.value = {
      value:
        json.data.recurringAmount ?? json.data.opportunityAmount ?? null,
      frequency: "",
    };
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "No pudimos cargar tu información.";
  } finally {
    isLoading.value = false;
  }
}

async function handleSubmit() {
  if (!record.value) return;
  errorMessage.value = null;
  successMessage.value = null;

  const amountOk = await amountStepRef.value?.validate();
  if (!amountOk?.ok) return;

  const paymentOk = await paymentStepRef.value?.validate();
  if (!paymentOk?.ok) return;

  if (payment.value.token != null && !canSavePaymentMethod.value) {
    errorMessage.value =
      "Por el momento no podemos guardar un nuevo método de pago desde acá. " +
      "Podés actualizar el monto o escribirnos para que te ayudemos con el cobro.";
    return;
  }

  isSubmitting.value = true;
  try {
    const body: {
      amount: number;
      record: FlowRecord;
      paymentMethodToken?: typeof payment.value.token;
    } = {
      amount: amount.value.value as number,
      record: record.value,
    };
    if (payment.value.token) body.paymentMethodToken = payment.value.token;

    const json = await $fetch<{ error: boolean; message?: string }>(
      `/api/flow/actualizar-donacion/${oppId.value}`,
      { method: "POST", body },
    );
    if (json.error) {
      throw new Error(
        json.message || "No pudimos guardar los cambios. Probá de nuevo.",
      );
    }

    const parts = ["¡Gracias por seguir siendo parte de esta comunidad que transforma realidades!"];
    successMessage.value = parts.join(" ");
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "No pudimos guardar los cambios.";
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="mx-auto w-full max-w-xl px-4 py-5 sm:px-6">
    <p v-if="isLoading" class="text-sm text-muted-foreground">
      Cargando tu información…
    </p>

    <p v-else-if="!record" class="text-sm text-red-600">
      {{
        errorMessage ||
        "No pudimos cargar esta página. Probá de nuevo más tarde."
      }}
    </p>

    <form v-else class="space-y-5" @submit.prevent="handleSubmit">
      <header class="space-y-1.5">
        <!-- Logo: reemplazar src con el logo de la organización -->
        <img src="" alt="Logo" class="h-10 w-auto" />
        <h1 class="text-lg font-semibold text-foreground sm:text-xl">
          Actualizá tu donación
        </h1>
        <p class="text-sm leading-relaxed text-foreground">
          ¡Qué bueno que sigas acá! Tu compromiso hace posible que sigamos construyendo viviendas para que nadie en Argentina viva en un piso de tierra. Tu apoyo es clave, ¡reactivemos tu donación!
        </p>
        <p class="text-sm leading-relaxed text-foreground">
          Si hoy tenés la posibilidad de aumentar tu donación, nos ayudas a escalar nuestro trabajo.
        </p>
      </header>

      <AmountStep
        ref="amountStepRef"
        v-model="amount"
        title="Monto de tu donación"
        :description="
          previousQuotaText
            ? `Tu aporte actual es de ${previousQuotaText}. Podés ingresar acá un nuevo monto:`
            : 'Ingresá un monto que te resulte cómodo.'
        "
        :presets="[]"
        :frequencies="[]"
        :disabled="isSubmitting"
      />

      <p
        v-if="!canSavePaymentMethod"
        class="text-sm leading-relaxed text-muted-foreground"
      >
        Desde este enlace podés cambiar el monto. Si también necesitás
        actualizar tarjeta o CBU, escribinos y te acompañamos.
      </p>

      <PaymentMethodStep
        ref="paymentStepRef"
        v-model="payment"
        :required="false"
        :disabled="isSubmitting || !canSavePaymentMethod"
        title="Actualiza tu medio de pago"
        description="Si cambiaste de tarjeta o preferís adherir un CBU, completá los datos abajo."
      />

      <p v-if="errorMessage" class="text-sm text-red-600" role="alert">
        {{ errorMessage }}
      </p>
      <p
        v-if="successMessage"
        class="text-sm text-emerald-700 dark:text-emerald-400"
      >
        {{ successMessage }}
      </p>

      <button
        type="submit"
        :disabled="isSubmitting"
        class="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {{ isSubmitting ? "Guardando..." : "Reactivar mi compromiso" }}
      </button>
    </form>
  </main>
</template>
