import type { BankDetails, BankAccount, PaymentMethodEntry } from '../types/setupProfile';

// Shared between BankingStep (editing) and ReviewStep (read-only summary) —
// older profiles were saved before multi-account/multi-method support and
// only have the legacy top-level fields, so both places need to fold those
// into accounts[0] / paymentMethods[0] the same way, or the review screen
// ends up showing blank Bank Details for data that's actually there.
export const deriveAccounts = (bd: BankDetails | null | undefined): BankAccount[] => {
  if (bd?.accounts && bd.accounts.length > 0) return bd.accounts;
  const hasLegacy = bd && (bd.accountHolderName || bd.bankName || bd.accountNumber);
  if (!hasLegacy) return [];
  return [{
    id: 'legacy', accountHolderName: bd!.accountHolderName, bankName: bd!.bankName, branchName: bd!.branchName,
    accountType: bd!.accountType, accountNumber: bd!.accountNumber, confirmAccountNumber: bd!.confirmAccountNumber,
    ifsc: bd!.ifsc, swift: bd!.swift, bankAddress: bd!.bankAddress,
  }];
};

export const deriveMethods = (bd: BankDetails | null | undefined): PaymentMethodEntry[] => {
  if (bd?.paymentMethods && bd.paymentMethods.length > 0) return bd.paymentMethods;
  const hasLegacy = bd && (bd.preferredPaymentMethod || bd.currency || bd.upiId);
  if (!hasLegacy) return [];
  return [{
    id: 'legacy', preferredPaymentMethod: bd!.preferredPaymentMethod, paymentTerms: bd!.paymentTerms,
    currency: bd!.currency, creditPeriod: bd!.creditPeriod, upiId: bd!.upiId,
  }];
};
