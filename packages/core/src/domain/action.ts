import { z } from 'zod';

export const ActionType = z.enum([
  'click', 'dblclick', 'rightclick',
  'keydown', 'keyup', 'type',
  'scroll', 'hover', 'drag', 'drop',
  'upload', 'download',
  'select', 'check', 'uncheck',
  'navigate', 'back', 'forward', 'refresh',
  'newTab', 'closeTab', 'switchTab',
  'wait', 'screenshot', 'copy', 'extract','loop',
]);
export type ActionType = z.infer<typeof ActionType>;

export const SelectorSetSchema = z.object({
  css: z.string().optional(),
  xpath: z.string().optional(),
  playwright: z.string().optional(),
  text: z.string().optional(),
  role: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  dataTestId: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  className: z.string().optional(),
  domPath: z.string().optional(),
});
export type SelectorSet = z.infer<typeof SelectorSetSchema>;

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

// Step payload schemas – refined per action.
export const ClickPayloadSchema = z.object({
  selectors: SelectorSetSchema,
  boundingBox: BoundingBoxSchema.optional(),
});
export type ClickPayload = z.infer<typeof ClickPayloadSchema>;

export const FillPayloadSchema = z.object({
  selectors: SelectorSetSchema,
  value: z.string(),
  isVariable: z.boolean().optional(),
  inputType: z.string().optional(),
});
export type FillPayload = z.infer<typeof FillPayloadSchema>;

export const KeyPayloadSchema = z.object({
  key: z.string(),
  selectors: SelectorSetSchema.optional(),
});
export type KeyPayload = z.infer<typeof KeyPayloadSchema>;

export const SelectPayloadSchema = z.object({
  selectors: SelectorSetSchema,
  value: z.string(),
  isVariable: z.boolean().optional(),
});
export type SelectPayload = z.infer<typeof SelectPayloadSchema>;

export const ScrollPayloadSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
});
export type ScrollPayload = z.infer<typeof ScrollPayloadSchema>;

export const NavigatePayloadSchema = z.object({
  url: z.string(),
});
export type NavigatePayload = z.infer<typeof NavigatePayloadSchema>;

export const ScreenshotPayloadSchema = z.object({
  path: z.string().optional(),
  dataUrl: z.string().optional(),
});
export type ScreenshotPayload = z.infer<typeof ScreenshotPayloadSchema>;

export const ExtractPayloadSchema = z.object({
  field: z.string(),                 // user-defined field name
  type: z.enum(['text', 'html', 'attribute', 'linkUrl', 'linkText', 'imageUrl', 'downloadImage', 'table', 'list', 'jsonApi', 'screenshot', 'aiSummary']),
  attribute: z.string().optional(),   // if type = 'attribute'
  selectors: SelectorSetSchema,
  tag: z.string().optional(),
  attributes: z.record(z.string()).optional(),
  textHint: z.string().optional(),
  pagePattern: z.string().optional(),
});
export type ExtractPayload = z.infer<typeof ExtractPayloadSchema>;



export const StepSchema = z.object({
  id: z.string().optional(),
  action: ActionType,
  payload: z.any(), // refined later
  selectors: SelectorSetSchema.optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  tabId: z.string().optional(),
  timestamp: z.date(),
  screenshotBefore: z.string().optional(),
  screenshotAfter: z.string().optional(),
});
export type Step = z.infer<typeof StepSchema>;


export const LoopPayloadSchema = z.object({
  containerSelector: SelectorSetSchema,
  steps: z.array(StepSchema),
});
export type LoopPayload = z.infer<typeof LoopPayloadSchema>;

export const StepPayloadSchema = z.union([
  ClickPayloadSchema,
  FillPayloadSchema,
  KeyPayloadSchema,
  SelectPayloadSchema,
  ScrollPayloadSchema,
  NavigatePayloadSchema,
  ScreenshotPayloadSchema,
  ExtractPayloadSchema,
  LoopPayloadSchema,
]);
export type StepPayload = z.infer<typeof StepPayloadSchema>;

export const VariableSchema = z.object({
  name: z.string(),
  value: z.string(),      // example value captured
  type: z.enum(['email', 'password', 'search', 'text', 'number', 'url']),
  description: z.string().optional(),
});
export type Variable = z.infer<typeof VariableSchema>;

export const WorkflowSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  variables: z.array(VariableSchema).optional(),
  steps: z.array(StepSchema),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;


