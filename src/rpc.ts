import { Rpc } from "@opencode/plugin/rpc"

const statusSchema = {
  type: "object",
  properties: {
    sessionID: { type: "string" },
    providerID: { type: "string" },
    modelID: { type: "string" },
    period: { type: "string", enum: ["peak", "off-peak"] },
    scheduledPeriod: { type: "string", enum: ["peak", "off-peak"] },
    source: { type: "string", enum: ["official-schedule", "api-header"] },
    phase: { type: "string", enum: ["request", "response"] },
    mismatch: { type: "boolean" },
    observedAt: { type: "number" },
    evidence: { type: "string" },
    holiday: { type: "string" },
  },
  required: [
    "sessionID",
    "providerID",
    "modelID",
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
