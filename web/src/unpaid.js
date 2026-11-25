// Shared by the screens that offer "Mark Unpaid" (invoices and vendor receivings).
// The server takes the money back off the document and reverses it in the payment history,
// dated with the user's local day.
export const localToday = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

export const confirmUnpaidInvoice = (number) =>
  window.confirm(
    `Mark ${number} unpaid?\n\nUse this when the money was not really received (wrong click, bounced check). ` +
      'What was recorded as paid is owed again and is reversed in the payment history. Returned goods stay returned.',
  );

export const confirmUnpaidReceiving = (number) =>
  window.confirm(
    `Mark ${number} unpaid?\n\nWhat was recorded as paid to the vendor is owed again and is reversed in their payment history.`,
  );
