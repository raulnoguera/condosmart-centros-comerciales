export type FormState = { error?: string; ok?: string } | null;
export type FormAction = (prev: FormState, data: FormData) => Promise<FormState>;
