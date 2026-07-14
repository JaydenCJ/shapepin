/**
 * Public programmatic API. Everything the CLI does is available as
 * pure functions over plain data, so pins can be inferred, merged,
 * checked and rendered inside any test runner without spawning a
 * process.
 */
export {
  ENUM_MAX,
  InputError,
  KIND_ORDER,
  ShapepinError,
  TOLERANCE_RULES,
  VALUE_TRACK_CAP,
} from "./types.js";
export type {
  AnyShape,
  ArrayShape,
  BooleanShape,
  DriftIssue,
  IssueKind,
  JsonValue,
  NullShape,
  NumberShape,
  ObjectField,
  ObjectShape,
  Pin,
  Shape,
  ShapeKind,
  StringFormat,
  StringShape,
  Tolerance,
  ToleranceRule,
  UnionShape,
} from "./types.js";

export { detectFormat } from "./formats.js";
export { infer, inferAll, mergeExample } from "./infer.js";
export { enumOf, mergeShapes } from "./merge.js";
export {
  matchPath,
  parseTolerance,
  RuleSet,
  sortTolerances,
  validatePattern,
  validateRule,
} from "./rules.js";
export { checkPin, checkValue, preview } from "./check.js";
export {
  parsePin,
  PIN_FORMAT_VERSION,
  serializePin,
  validatePinName,
} from "./pinfile.js";
export { renderShape } from "./render.js";
export {
  checkReportJson,
  displayPath,
  renderCheckReport,
  type PayloadResult,
} from "./report.js";
export { VERSION } from "./version.js";
