const { sendMail } = require('./src/utils/mailer');

const html = `
  <p>Dear Shantanu,</p>
  <p>This has been resolved. The tender is now available on OpenProcure:</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 10px;border:1px solid #dde4f0;background:#f8fafc;font-weight:600">Organisation Chain</td><td style="padding:6px 10px;border:1px solid #dde4f0">Principal - Government Doon Medical College Dehradun</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #dde4f0;background:#f8fafc;font-weight:600">Tender Reference Number</td><td style="padding:6px 10px;border:1px solid #dde4f0">GDMC/Store/Surgical1/2026/6412</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #dde4f0;background:#f8fafc;font-weight:600">Tender ID</td><td style="padding:6px 10px;border:1px solid #dde4f0">2026_DMC_99815_1</td></tr>
  </table>
  <p>You can view it here: <a href="https://openprocure.ai/tenders/tenderdetails/2026_DMC_99815_1">https://openprocure.ai/tenders/tenderdetails/2026_DMC_99815_1</a></p>
  <p>The tender documents (Notice, Tender Document, and BOQ) are also attached to the record and available for download from the same page.</p>
  <p>Please check and let us know if you face any further issue.</p>
  <p>Thanks & Regards,<br/>Team OpenProcure</p>
`;

(async () => {
  const result = await sendMail({
    to: 'shantanu.tandel@merillife.com',
    subject: 'Resolved: Tender GDMC/Store/Surgical1/2026/6412 (2026_DMC_99815_1) now available on OpenProcure',
    html,
  });
  console.log(result);
  process.exit(0);
})();
