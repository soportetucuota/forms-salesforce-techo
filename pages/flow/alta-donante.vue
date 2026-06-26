<script setup lang="ts">
/**
 * Flow: "alta-donante" — Donor onboarding (2 steps).
 *
 * URL: /flow/alta-donante
 *
 * Wizard de 2 pasos para alta de donantes:
 *   Step 1 — datos personales (nombre, apellido, fecha nac., email, tel)
 *   Step 2 — monto + frecuencia, método de pago, DNI, términos + "¿Ya sos donante?"
 *
 * El patrón anti-abandono se preserva: `onStepAdvance` hace POST de los
 * datos personales después del paso 1 para crear el Contact en Salesforce
 * aunque el donante nunca llegue al paso de pago.
 *
 * Para personalizar: cambiá colores en `assets/css/main.css`, editá el
 * copy acá, cambiá los montos preset, agregá o quitá steps. Para agregar
 * un campo nuevo:
 *   - poné un `<FieldText>` junto a un step (no requiere conocer el engine),
 *   - o creá un archivo nuevo en `components/steps/` e importalo.
 *
 * El endpoint del servidor está en `server/api/flow/alta-donante.post.ts`.
 */
import { computed, ref } from "vue";
import MultiStepFlow from "~/components/flow/MultiStepFlow.vue";
import PersonalDataStep, {
  type PersonalData,
} from "~/components/steps/PersonalDataStep.vue";
import AmountStep, {
  type AmountData,
} from "~/components/steps/AmountStep.vue";
import PaymentMethodStep, {
  type PaymentData,
} from "~/components/steps/PaymentMethodStep.vue";
import IdentificationStep, {
  type IdentificationData,
} from "~/components/steps/IdentificationStep.vue";
import AcceptanceStep, {
  type AcceptanceData,
} from "~/components/steps/AcceptanceStep.vue";
import FieldSelect from "~/components/fields/FieldSelect.vue";
import FlowHeader from "~/components/flow/FlowHeader.vue";
import { useFlowState } from "~/composables/useFlowState";
import { transformBirthDateToISO } from "~/composables/formatters";

// `definePageMeta` is the canonical place to label a flow. The landing
// page (`pages/index.vue`) reads these via `useRouter().getRoutes()` to
// auto-render an onboarding list, so changing them here is enough —
// no need to also edit a separate manifest.
definePageMeta({
  flowTitle: "Alta de donante",
  flowDescription:
    "Wizard de 2 pasos: datos personales del donante y, después, monto + tarjeta o CBU + DNI + términos.",
});

useHead({ title: "Sumate como donante" });

const route = useRoute();
const campaign = computed(() => {
  const q = route.query.campaign;
  return Array.isArray(q) ? String(q[0] ?? "") : String(q ?? "");
});

interface AltaState {
  personal: PersonalData;
  amount: AmountData;
  payment: PaymentData;
  ident: IdentificationData;
  accept: AcceptanceData;
  alreadyDonor: string;
}

const state = useFlowState<AltaState>({
  personal: {
    firstName: "",
    lastName: "",
    birthDate: "",
    email: "",
    phone: "",
    country: "Argentina",
    province: "",
  },
  amount: { value: null, frequency: "Mensual" },
  payment: { token: null },
  ident: { number: "" },
  accept: { tyc: false },
  alreadyDonor: "",
});

const contactId = ref<string | null>(null);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const alreadyDonorError = ref<string | null>(null);

async function onStepAdvance(stepIndex: number) {
  if (stepIndex !== 1) return;
  errorMessage.value = null;
  const res = await $fetch<{
    error: boolean;
    message?: string;
    data?: { contactId: string };
  }>("/api/flow/alta-donante", {
    method: "POST",
    body: {
      stage: "personal",
      personal: {
        ...state.value.personal,
        birthDate: transformBirthDateToISO(state.value.personal.birthDate),
      },
      campaign: campaign.value || null,
    },
  });
  if (res.error) {
    throw new Error(
      res.message ?? "No pudimos guardar tus datos. Intentá de nuevo.",
    );
  }
  if (res.data?.contactId) contactId.value = res.data.contactId;
}

async function onSubmit() {
  errorMessage.value = null;
  alreadyDonorError.value = null;
  if (!state.value.alreadyDonor) {
    alreadyDonorError.value = "Contanos si ya sos donante.";
    return;
  }
  if (!contactId.value) {
    errorMessage.value =
      "Perdimos la referencia a tu contacto. Recargá la página y volvé a intentar.";
    return;
  }
  if (!state.value.payment.token) {
    errorMessage.value = "Completá los datos de tu tarjeta o CBU.";
    return;
  }

  isSubmitting.value = true;
  try {
    const res = await $fetch<{ error: boolean; message?: string }>(
      "/api/flow/alta-techo",
      {
        method: "POST",
        body: {
          stage: "finalize",
          contactId: contactId.value,
          amount: state.value.amount.value,
          frequency: state.value.amount.frequency,
          paymentMethodToken: state.value.payment.token,
          dni: state.value.ident.number,
          alreadyDonor: state.value.alreadyDonor,
          campaign: campaign.value || null,
        },
      },
    );
    if (res.error) {
      throw new Error(
        res.message ?? "No pudimos completar tu alta. Intentá de nuevo.",
      );
    }
    successMessage.value = "¡Gracias por sumarte!";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "No pudimos completar tu alta.";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-xl px-4 py-5 sm:px-6">
    <!-- Para agregar tu logo: pone el archivo en public/logos/ y agregá la prop logo="/logos/tu-logo.png" -->
    <FlowHeader
      title="Sumate como donante"
      description="Tu donación nos permite seguir trabajando por nuestra misión. Completá el formulario para sumarte."
    />

    <div
      v-if="successMessage"
      class="rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
    >
      <p class="text-sm font-semibold">{{ successMessage }}</p>
      <p class="mt-1 text-sm">
        Recibirás un email con los detalles de tu donación.
      </p>
    </div>

    <MultiStepFlow
      v-else
      :steps="2"
      action-label="Donar"
      next-label="Continuar"
      :is-submitting="isSubmitting"
      :is-submitted="!!successMessage"
      :on-step-advance="onStepAdvance"
      @submit="onSubmit"
    >
      <template #step-1>
        <PersonalDataStep
          v-model="state.personal"
          :step-index="1"
          title="Empezá con tus datos"
          description="Vamos a usarlos solo para registrar tu donación."
          :include-country="false"
          :include-province="false"
          :disabled="isSubmitting"
        />
      </template>

      <template #step-2>
        <AmountStep
          v-model="state.amount"
          :step-index="2"
          title="Elegí cuánto y cómo"
          description="Tu donación llega entera a nuestros programas."
          :presets="[12000, 18000, 25000]"
          :frequencies="[
            { value: 'Mensual', label: 'Todos los meses' },
            { value: 'Única vez', label: 'Por única vez' },
          ]"
          :disabled="isSubmitting"
        />

        <PaymentMethodStep
          v-model="state.payment"
          :step-index="2"
          :disabled="isSubmitting"
        />

        <IdentificationStep
          v-model="state.ident"
          :step-index="2"
          mode="DNI"
          label="DNI"
          placeholder="23554134"
          :disabled="isSubmitting"
        />

        <AcceptanceStep
          v-model="state.accept"
          :step-index="2"
          terms-url="https://drive.google.com/file/d/1-rbt7KG32tIBssGh7sbvU99oVq2vhKFH/view"
          terms-label="términos y condiciones"
          :disabled="isSubmitting"
        >
          <template #extra>
            <FieldSelect
              :model-value="state.alreadyDonor"
              label="¿Ya sos donante?"
              :options="[
                { value: 'SI', label: 'Sí' },
                { value: 'NO', label: 'No' },
              ]"
              required
              :error="alreadyDonorError"
              :disabled="isSubmitting"
              @update:model-value="
                (v) => {
                  state.alreadyDonor = String(v ?? '');
                  alreadyDonorError = null;
                }
              "
            />
          </template>
        </AcceptanceStep>
      </template>
    </MultiStepFlow>

    <p v-if="errorMessage" class="mt-4 text-sm text-red-600" role="alert">
      {{ errorMessage }}
    </p>
  </main>
</template>
