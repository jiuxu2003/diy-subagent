/**
 * Public API of the templates feature. Other features consume template
 * queries and the personal-template mutation through this entry point
 * instead of importing hook modules directly.
 */
export {
  useSavePersonalTemplate,
  useTemplate,
  useTemplates,
} from "./hooks/useTemplates";
