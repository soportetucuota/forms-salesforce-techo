import { Connection } from "jsforce";
import type { DebiPaymentToken } from "~/composables/useDebiClient";

/**
 * Consumer Keys of Debi's `Debi_Forms_Onboarding` Connected Apps. Production
 * and sandbox orgs are served by different Connected Apps with different
 * Consumer Keys, so the runtime selects one based on `SF_LOGIN_URL`. Both
 * apps are public PKCE clients — there's no Consumer Secret, so these values
 * are safe to commit. Refresh tokens minted by the central onboarding helper
 * are bound to the matching client_id.
 */
const SF_PRODUCTION_CLIENT_ID =
  "3MVG9riCAn8HHkYWlE8jFLOna32YIJWbJVjAocus39R7jqQUZwHtITeYr2353Z2i.wp9AsDy5RiZ.LsDqWVyL";

const SF_SANDBOX_CLIENT_ID =
  "3MVG9riCAn8HHkYWlE8jFLOna30IpkiRTPvZhq4FuEXWAAZscYkV8wFd.3Hk1O6MXFMeyh6F0VvnTHPs4FLG3";

const SANDBOX_LOGIN_URL = "https://test.salesforce.com";

/** Picks the Connected App Consumer Key matching the org's login host. */
function clientIdForLoginUrl(loginUrl: string): string {
  return loginUrl.trim().toLowerCase().startsWith(SANDBOX_LOGIN_URL)
    ? SF_SANDBOX_CLIENT_ID
    : SF_PRODUCTION_CLIENT_ID;
}


// Default field map for NPSP-style orgs. If your Salesforce instance uses
// non-standard API names for the recurring donation amount, the payment
// method lookup, etc., edit the values below directly. There is no env-var
// override on purpose: customers customize by editing this file.
type OpportunityFieldMap = {
  amount: string;
  paymentMethod: string;
  recurringLookup: string;
};

type RecurringFieldMap = {
  sobject: string;
  amount: string;
  paymentMethod: string;
};

export type SalesforceFieldMap = {
  opportunity: OpportunityFieldMap;
  recurring: RecurringFieldMap;
};

const FIELD_MAP: SalesforceFieldMap = {
  opportunity: {
    amount: "Amount",
    paymentMethod: "TCPagos__payment_method__c",
    recurringLookup: "npe03__Recurring_Donation__c",
  },
  recurring: {
    sobject: "npe03__Recurring_Donation__c",
    amount: "npe03__Amount__c",
    paymentMethod: "Metodo_de_Pago__c",
  },
};

export type FlowRecord = {
  opportunityId: string;
  opportunityName: string | null;
  opportunityContactId: string | null;
  opportunityAmount: number | null;
  opportunityPaymentMethodId: string | null;
  recurringDonationId: string | null;
  recurringAmount: number | null;
  recurringPaymentMethodId: string | null;
};

export class FlowRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "FlowRequestError";
    this.status = status;
  }
}

/**
 * Pulls the real Salesforce error message out of a jsforce `.create()` /
 * `.update()` failure result. jsforce returns `{ success: false, errors:
 * [{ statusCode, message, fields }] }` for API-level failures (e.g.,
 * `INVALID_FIELD: No such column 'Foo__c' on entity Contact`). Without
 * this helper, our generic `"No se pudo crear ..."` swallowed the
 * statusCode and made debugging painful — especially when the org the
 * env vars point to doesn't have all the custom fields the flow writes.
 */
function formatSaveFailure(
  result: { success?: boolean; errors?: unknown },
  fallback: string,
): string {
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const pieces = errors
    .map((e: unknown) => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object") {
        const obj = e as { statusCode?: string; message?: string };
        const code = obj.statusCode ? `${obj.statusCode}: ` : "";
        if (obj.message) return `${code}${obj.message}`;
      }
      return "";
    })
    .filter(Boolean);
  if (pieces.length === 0) return fallback;
  return `${fallback} — ${pieces.join("; ")}`;
}

/**
 * Shape of the personal data captured by `PersonalDataStep`. Optional
 * fields stay as empty strings when the step renders without them.
 */
export type AltaPersonal = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** ISO YYYY-MM-DD (already transformed). Optional in some flows. */
  birthDate?: string;
  country?: string;
  province?: string;
};

/**
 * Free-form custom fields that a flow page may want to write straight
 * onto Contact / Opportunity / Recurring Donation. Each key must be a
 * valid Salesforce API name (e.g., `Captador__c`, `Observaciones__c`).
 *
 * The runtime forwards them unchanged: this is the escape hatch for
 * flows that need org-specific fields without growing this util.
 */
export type AltaExtraFields = {
  contact?: Record<string, string | number | boolean | null>;
  opportunity?: Record<string, string | number | boolean | null>;
  recurring?: Record<string, string | number | boolean | null>;
};

function requireString(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${label}`);
  }
  return value;
}

function escapeSoql(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function sanitizeOppId(oppId: string): string {
  if (!/^[a-zA-Z0-9]{15,18}$/.test(oppId)) {
    throw new Error("El formato del ID de Oportunidad no es válido");
  }
  return oppId;
}

/** True when two Salesforce ids refer to the same record (15-char key). */
function sameSalesforceId(a: string, b: string): boolean {
  return a.slice(0, 15).toLowerCase() === b.slice(0, 15).toLowerCase();
}

async function openConnection(): Promise<Connection> {
  const config = useRuntimeConfig();
  const loginUrl = requireString(config.sfLoginUrl, "SF_LOGIN_URL");
  const instanceUrl = requireString(config.sfInstanceUrl, "SF_INSTANCE_URL");
  const refreshToken = requireString(config.sfRefreshToken, "SF_REFRESH_TOKEN");

  // Refresh tokens are minted by Debi's bundled PKCE-only Connected App and
  // are bound to its Consumer Key. The Connected App is public, so no
  // client_secret is ever needed.
  const refreshParams: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: clientIdForLoginUrl(loginUrl),
    refresh_token: refreshToken,
  };

  const tokenResponse = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(refreshParams).toString(),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Falló la renovación OAuth de Salesforce: ${await tokenResponse.text()}`,
    );
  }

  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error(
      "La renovación OAuth de Salesforce no devolvió access_token",
    );
  }

  return new Connection({
    instanceUrl,
    accessToken: tokenJson.access_token,
  });
}

async function withSalesforceConnection<R>(
  work: (conn: Connection) => Promise<R>,
): Promise<R> {
  return work(await openConnection());
}

function pickContactId(opp: Record<string, unknown>): string | null {
  const c = opp.ContactId;
  if (typeof c === "string" && c.length > 0) return c;
  const npsp = opp.npsp__Primary_Contact__c;
  if (typeof npsp === "string" && npsp.length > 0) return npsp;
  return null;
}

async function queryOpportunityRow(
  conn: Connection,
  map: SalesforceFieldMap,
  safeOppId: string,
): Promise<Record<string, unknown>> {
  const core = `Id, Name, ContactId, ${map.opportunity.amount}, ${map.opportunity.paymentMethod}, ${map.opportunity.recurringLookup}`;
  const run = (extraField: string) =>
    conn.query<Record<string, unknown>>(
      `SELECT ${core}${extraField} FROM Opportunity WHERE Id = '${safeOppId}' LIMIT 1`,
    );

  try {
    const row = (await run(", npsp__Primary_Contact__c")).records[0];
    if (!row) throw new Error("No se encontró la oportunidad");
    return row;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/INVALID_FIELD|No such column/i.test(msg)) throw error;
    const row = (await run("")).records[0];
    if (!row) throw new Error("No se encontró la oportunidad");
    return row;
  }
}

async function loadFlowRecord(
  conn: Connection,
  map: SalesforceFieldMap,
  oppId: string,
): Promise<FlowRecord> {
  const safeId = escapeSoql(sanitizeOppId(oppId));
  const opp = await queryOpportunityRow(conn, map, safeId);
  const recurringId = (opp[map.opportunity.recurringLookup] as string) || null;

  const record: FlowRecord = {
    opportunityId: opp.Id as string,
    opportunityName: (opp.Name as string) || null,
    opportunityContactId: pickContactId(opp),
    opportunityAmount: (opp[map.opportunity.amount] as number) ?? null,
    opportunityPaymentMethodId:
      (opp[map.opportunity.paymentMethod] as string) ?? null,
    recurringDonationId: recurringId,
    recurringAmount: null,
    recurringPaymentMethodId: null,
  };

  if (!recurringId) return record;

  const rec = (
    await conn.query<Record<string, unknown>>(
      `SELECT Id, ${map.recurring.amount}, ${map.recurring.paymentMethod}
       FROM ${map.recurring.sobject}
       WHERE Id = '${escapeSoql(recurringId)}'
       LIMIT 1`,
    )
  ).records[0];

  if (rec) {
    record.recurringAmount = (rec[map.recurring.amount] as number) ?? null;
    record.recurringPaymentMethodId =
      (rec[map.recurring.paymentMethod] as string) ?? null;
  }
  return record;
}

export async function getFlowRecord(oppId: string): Promise<FlowRecord> {
  return withSalesforceConnection((conn) =>
    loadFlowRecord(conn, FIELD_MAP, oppId),
  );
}

function paymentMethodPayload(
  debiToken: DebiPaymentToken,
  contactId: string,
): Record<string, string | number | null | undefined> {
  const typePayload = debiToken[debiToken.type] || {};
  const last4 = typePayload.last_four_digits || "";
  const networkOrType = typePayload.network || debiToken.type;
  const funding = typePayload.funding || "";

  return {
    Name: `Flow - ${networkOrType} ${last4}`.trim(),
    TCPagos__Tu_cuota_Id__c: debiToken.id,
    TCPagos__type__c: debiToken.type,
    TCPagos__last_four_digits__c: last4 || null,
    TCPagos__Fingerprint__c: typePayload.fingerprint || null,
    TCPagos__Funding__c: funding || null,
    TCPagos__Issuer__c: typePayload.issuer || null,
    TCPagos__Network__c: networkOrType || null,
    TCPagos__brand__c: networkOrType || null,
    TCPagos__bank__c: typePayload.bank || null,
    TCPagos__expiration_month__c:
      debiToken.type === "card"
        ? (debiToken.card?.expiration_month ?? null)
        : null,
    TCPagos__expiration_year__c:
      debiToken.type === "card"
        ? (debiToken.card?.expiration_year ?? null)
        : null,
    TCPagos__Contact__c: contactId,
  };
}

async function createPaymentMethod(
  conn: Connection,
  debiToken: DebiPaymentToken,
  contactId: string,
): Promise<string> {
  const createResult = await conn
    .sobject("TCPagos__Payment_Method__c")
    .create(paymentMethodPayload(debiToken, contactId));

  if (!createResult.success || !createResult.id) {
    throw new FlowRequestError(
      formatSaveFailure(
        createResult,
        "No se pudo crear el método de pago en Salesforce",
      ),
    );
  }
  return createResult.id;
}

async function updateOpportunityAndRecurring(
  conn: Connection,
  map: SalesforceFieldMap,
  record: FlowRecord,
  amount: number,
  salesforcePaymentMethodId: string | null,
): Promise<boolean> {
  const oppUpdateResult = salesforcePaymentMethodId
    ? await conn.sobject("Opportunity").update({
        Id: record.opportunityId,
        [map.opportunity.amount]: amount,
        [map.opportunity.paymentMethod]: salesforcePaymentMethodId,
      })
    : await conn.sobject("Opportunity").update({
        Id: record.opportunityId,
        [map.opportunity.amount]: amount,
      });

  if (!oppUpdateResult.success) {
    throw new FlowRequestError(
      formatSaveFailure(
        oppUpdateResult,
        "No se pudo actualizar la Oportunidad",
      ),
    );
  }

  if (!record.recurringDonationId) return false;

  const recurringUpdateResult = salesforcePaymentMethodId
    ? await conn.sobject(map.recurring.sobject).update({
        Id: record.recurringDonationId,
        [map.recurring.amount]: amount,
        [map.recurring.paymentMethod]: salesforcePaymentMethodId,
      })
    : await conn.sobject(map.recurring.sobject).update({
        Id: record.recurringDonationId,
        [map.recurring.amount]: amount,
      });

  if (!recurringUpdateResult.success) {
    throw new FlowRequestError(
      formatSaveFailure(
        recurringUpdateResult,
        "No se pudo actualizar la donación recurrente",
      ),
    );
  }
  return true;
}

const SF_CONTACT_ID = /^[a-zA-Z0-9]{15,18}$/;

export async function submitFlow(input: {
  oppId: string;
  amount: number;
  /** Omit to update amount only (payment method fields unchanged in Salesforce). */
  paymentMethodToken?: DebiPaymentToken;
  /** From GET `/api/flow/:oppId`; skips a duplicate SOQL load when present and matches `oppId`. */
  record?: FlowRecord;
}): Promise<{
  salesforcePaymentMethodId: string | null;
  recurringUpdated: boolean;
}> {
  return withSalesforceConnection(async (conn) => {
    const safeOpp = sanitizeOppId(input.oppId);
    let record: FlowRecord;
    if (input.record != null) {
      if (!sameSalesforceId(input.record.opportunityId, safeOpp)) {
        throw new FlowRequestError(
          "El registro no coincide con esta oportunidad",
          400,
        );
      }
      record = input.record;
    } else {
      record = await loadFlowRecord(conn, FIELD_MAP, safeOpp);
    }

    const token = input.paymentMethodToken;
    let salesforcePaymentMethodId: string | null = null;

    if (token) {
      const contactId = record.opportunityContactId?.trim() ?? "";
      if (!contactId || !SF_CONTACT_ID.test(contactId)) {
        throw new FlowRequestError(
          "La oportunidad no tiene un ID de Contacto; vinculá un contacto en la oportunidad (o extendé la consulta de la API para el contacto principal de NPSP).",
          400,
        );
      }
      salesforcePaymentMethodId = await createPaymentMethod(
        conn,
        token,
        contactId,
      );
    }

    const recurringUpdated = await updateOpportunityAndRecurring(
      conn,
      FIELD_MAP,
      record,
      input.amount,
      salesforcePaymentMethodId,
    );

    return { salesforcePaymentMethodId, recurringUpdated };
  });
}

// ---------------------------------------------------------------------------
// Alta (new donor): create Contact + Opportunity + (optional) Recurring
// Donation + Payment Method, all linked together.
// ---------------------------------------------------------------------------

/**
 * Contact field map — kept in this file (not in `FIELD_MAP`) because most
 * orgs use the standard names (`FirstName`, `LastName`, `Email`, etc.).
 * Override here if the org renamed them.
 */
const CONTACT_FIELDS = {
  firstName: "FirstName",
  lastName: "LastName",
  email: "Email",
  phone: "MobilePhone",
  birthDate: "Birthdate",
  country: "MailingCountry",
  province: "MailingState",
} as const;

/**
 * Opportunity defaults for new altas. `StageName` is required by Salesforce
 * on every Opportunity insert. Override the constants in this section to
 * match your sales process.
 */
const ALTA_OPP_DEFAULTS = {
  stageName: "Pledged",
  closeDateOffsetDays: 0,
  recordTypeName: null as string | null,
};

async function findContactByEmail(
  conn: Connection,
  email: string,
): Promise<string | null> {
  const safe = escapeSoql(email);
  const result = await conn.query<{ Id: string }>(
    `SELECT Id FROM Contact WHERE Email = '${safe}' LIMIT 1`,
  );
  return result.records[0]?.Id ?? null;
}

/**
 * Find or create a Contact for the donor. Lookup is by email; if no
 * existing contact matches, we insert a new one with whatever personal
 * data the flow page collected.
 */
export async function findOrCreateContact(input: {
  personal: AltaPersonal;
  extra?: AltaExtraFields["contact"];
}): Promise<{ contactId: string; created: boolean }> {
  if (!input.personal.email) {
    throw new FlowRequestError(
      "Falta el email del donante para crear el contacto.",
      400,
    );
  }
  return withSalesforceConnection(async (conn) => {
    const existing = await findContactByEmail(conn, input.personal.email);
    if (existing) {
      return { contactId: existing, created: false };
    }

    const payload: Record<string, unknown> = {
      [CONTACT_FIELDS.firstName]: input.personal.firstName,
      [CONTACT_FIELDS.lastName]: input.personal.lastName,
      [CONTACT_FIELDS.email]: input.personal.email,
      [CONTACT_FIELDS.phone]: input.personal.phone,
    };
    if (input.personal.birthDate) {
      payload[CONTACT_FIELDS.birthDate] = input.personal.birthDate;
    }
    if (input.personal.country) {
      payload[CONTACT_FIELDS.country] = input.personal.country;
    }
    if (input.personal.province) {
      payload[CONTACT_FIELDS.province] = input.personal.province;
    }
    if (input.extra) Object.assign(payload, input.extra);

    const result = await conn.sobject("Contact").create(payload);
    if (!result.success || !result.id) {
      throw new FlowRequestError(
        formatSaveFailure(
          result,
          "No se pudo crear el contacto en Salesforce",
        ),
      );
    }
    return { contactId: result.id, created: true };
  });
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Creates the donation chain for an alta:
 *
 *   Contact (must exist) → Opportunity → [optional Recurring Donation] → Payment Method
 *
 * Returns the IDs of every record it touched so the caller can render a
 * success state or follow up with extra writes.
 */
export async function createDonationChain(input: {
  contactId: string;
  amount: number;
  /** `"Mensual"` triggers RD creation; anything else creates a one-time Opp. */
  frequency: string;
  paymentMethodToken: DebiPaymentToken;
  campaign?: string | null;
  /** Free text — written to `Description` on the Opportunity if provided. */
  observations?: string | null;
  extra?: AltaExtraFields;
  /** Override the default `StageName` for the Opportunity. */
  stageName?: string;
}): Promise<{
  opportunityId: string;
  recurringDonationId: string | null;
  paymentMethodId: string;
}> {
  return withSalesforceConnection(async (conn) => {
    const isRecurring = input.frequency === "Mensual";
    const map = FIELD_MAP;

    const paymentMethodId = await createPaymentMethod(
      conn,
      input.paymentMethodToken,
      input.contactId,
    );

    let recurringDonationId: string | null = null;
    if (isRecurring) {
      const recurringPayload: Record<string, unknown> = {
        Name: `RD ${input.contactId} ${todayPlusDays(0)}`,
        npe03__Contact__c: input.contactId,
        [map.recurring.amount]: input.amount,
        [map.recurring.paymentMethod]: paymentMethodId,
        npe03__Installment_Period__c: "Monthly",
        npe03__Date_Established__c: todayPlusDays(0),
      };
      if (input.extra?.recurring) {
        Object.assign(recurringPayload, input.extra.recurring);
      }
      const rdResult = await conn
        .sobject(map.recurring.sobject)
        .create(recurringPayload);
      if (!rdResult.success || !rdResult.id) {
        throw new FlowRequestError(
          formatSaveFailure(
            rdResult,
            "No se pudo crear la donación recurrente",
          ),
        );
      }
      recurringDonationId = rdResult.id;
    }

    const oppName = `${isRecurring ? "Donación recurrente" : "Donación única"} - ${todayPlusDays(0)}`;
    const oppPayload: Record<string, unknown> = {
      Name: oppName,
      ContactId: input.contactId,
      StageName: input.stageName ?? ALTA_OPP_DEFAULTS.stageName,
      CloseDate: todayPlusDays(ALTA_OPP_DEFAULTS.closeDateOffsetDays),
      [map.opportunity.amount]: input.amount,
      [map.opportunity.paymentMethod]: paymentMethodId,
    };
    if (recurringDonationId) {
      oppPayload[map.opportunity.recurringLookup] = recurringDonationId;
    }
    if (input.campaign) {
      oppPayload["CampaignId"] = input.campaign;
    }
    if (input.observations) {
      oppPayload["Description"] = input.observations;
    }
    if (input.extra?.opportunity) {
      Object.assign(oppPayload, input.extra.opportunity);
    }

    const oppResult = await conn.sobject("Opportunity").create(oppPayload);
    if (!oppResult.success || !oppResult.id) {
      throw new FlowRequestError(
        formatSaveFailure(
          oppResult,
          "No se pudo crear la oportunidad en Salesforce",
        ),
      );
    }

    return {
      opportunityId: oppResult.id,
      recurringDonationId,
      paymentMethodId,
    };
  });
}
