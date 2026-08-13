export type CallDispositionOption = {
  key: string;
  label: string;
  enabled: boolean;
};

export type CallDispositionsConfig = {
  options: CallDispositionOption[];
  allowNotes: boolean;
};
