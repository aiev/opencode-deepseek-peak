import { Rpc } from "@opencode/plugin/rpc"

const windowSchema = {
  type: "object",
  properties: {
    days: { type: "array", items: { type: "integer" } },
    start: { type: "integer" },
    end: { type: "integer" },
  },
  required: ["days", "start", "end"],
  additionalProperties: false,
} as const

const scheduleSchema = {
  type: "object",
  properties: {
    windows: { type: "array", items: windowSchema },
    timeZone: { type: "string" },
    timeZoneLabel: { type: "string" },
    excludeHolidays: { type: "boolean" },
    nextChangeAt: { type: "number" },
    nextChangeKind: { type: "string", enum: ["peakStart", "peakEnd"] },
  },
  required: ["windows", "timeZone", "timeZoneLabel"],
  additionalProperties: false,
} as const

const statusSchema = {
  type: "object",
  properties: {
    sessionID: { type: "string" },
    providerID: { type: "string" },
    modelID: { type: "string" },
    providerLabel: { type: "string" },
    providerShort: { type: "string" },
    period: { type: "string", enum: ["peak", "off-peak", "unknown"] },
    scheduledPeriod: { type: "string", enum: ["peak", "off-peak", "unknown"] },
    source: { type: "string", enum: ["official-schedule", "api-header", "none"] },
    phase: { type: "string", enum: ["request", "response"] },
    mismatch: { type: "boolean" },
    observedAt: { type: "number" },
    evidence: { type: "string" },
    cached: { type: "boolean" },
    preview: { type: "boolean" },
    holiday: { type: "string" },
    schedule: scheduleSchema,
  },
  required: [
    "sessionID",
    "providerID",
    "modelID",
    "providerLabel",
    "providerShort",
    "period",
    "scheduledPeriod",
    "source",
    "phase",
    "mismatch",
    "observedAt",
    "evidence",
  ],
  additionalProperties: false,
} as const

export const DeepSeekPeakRpc = Rpc.define({
  id: "deepseek-peak",
  methods: {
    status: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          found: { type: "boolean" },
          status: statusSchema,
        },
        required: ["found"],
        additionalProperties: false,
      },
    },
    preview: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          found: { type: "boolean" },
          status: statusSchema,
        },
        required: ["found"],
        additionalProperties: false,
      },
    },
  },
  events: {
    updated: { schema: statusSchema },
  },
})