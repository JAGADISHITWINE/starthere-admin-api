function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function buildEmailBaseStyles() {
  return `
    <style>
      .sh-card {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 14px;
        background: #f9fafb;
      }
      .sh-table-wrap {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        margin-top: 10px;
      }
      .sh-table {
        width: 100%;
        min-width: 620px;
        border-collapse: collapse;
      }
      .sh-table th,
      .sh-table td {
        border: 1px solid #e5e7eb;
        padding: 10px;
        text-align: left;
        font-size: 13px;
        vertical-align: top;
        word-break: break-word;
        white-space: normal;
      }
      .sh-table th {
        background: #f3f4f6;
      }
      @media screen and (max-width: 600px) {
        .sh-table {
          min-width: 560px;
        }
        .sh-table th,
        .sh-table td {
          padding: 8px;
          font-size: 12px;
        }
      }
    </style>
  `;
}

function buildParticipantsTable(participants = []) {
  if (!Array.isArray(participants) || participants.length === 0) return "";

  const rows = participants
    .map((participant, index) => {
      const name = escapeHtml(participant?.name || "N/A");
      const age = escapeHtml(participant?.age ?? "N/A");
      const gender = escapeHtml(participant?.gender || "N/A");
      const phone = escapeHtml(participant?.phone || "N/A");
      const medicalInfo = escapeHtml(participant?.medical_info || participant?.medicalInfo || "None");

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${name}</td>
          <td>${age}</td>
          <td>${gender}</td>
          <td>${phone}</td>
          <td>${medicalInfo}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="margin-top: 16px;">
      <p style="margin: 0 0 8px;"><strong>Participant Details</strong></p>
      <div class="sh-table-wrap">
        <table class="sh-table" role="presentation">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Phone</th>
              <th>Medical Info</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function buildBookingCompletedEmail(payload = {}) {
  const customerName = escapeHtml(payload.customerName || 'Customer');
  const trekName = escapeHtml(payload.trekName || 'your trek');
  const bookingReference = escapeHtml(payload.bookingReference || 'N/A');
  const startDate = formatDate(payload.startDate);
  const endDate = formatDate(payload.endDate);
  const participantsTableHtml = buildParticipantsTable(payload.participantsDetails);

  const subject = `Your trek is now marked as completed (${bookingReference})`;

  const html = `
    ${buildEmailBaseStyles()}
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto;">
      <h2 style="margin-bottom: 10px;">Hello ${customerName},</h2>
      <p>Your booking has been marked as <strong>completed</strong>.</p>
      <div class="sh-card">
        <p style="margin: 0 0 8px;"><strong>Booking Reference:</strong> ${bookingReference}</p>
        <p style="margin: 0 0 8px;"><strong>Trek:</strong> ${trekName}</p>
        <p style="margin: 0;"><strong>Schedule:</strong> ${startDate} - ${endDate}</p>
      </div>
      ${participantsTableHtml}
      <p style="margin-top: 16px;">Thank you for trekking with StartHere.</p>
      <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">This is an automated email, please do not reply.</p>
    </div>
  `;

  const text = [
    `Hello ${payload.customerName || 'Customer'},`,
    '',
    'Your booking has been marked as completed.',
    `Booking Reference: ${payload.bookingReference || 'N/A'}`,
    `Trek: ${payload.trekName || 'N/A'}`,
    `Schedule: ${startDate} - ${endDate}`,
    '',
    'Thank you for trekking with StartHere.',
  ].join('\n');

  return { subject, html, text };
}

function buildBatchStatusChangedEmail(payload = {}) {
  const customerName = escapeHtml(payload.customerName || 'Customer');
  const trekName = escapeHtml(payload.trekName || 'your trek');
  const bookingReference = escapeHtml(payload.bookingReference || 'N/A');
  const startDate = formatDate(payload.startDate);
  const endDate = formatDate(payload.endDate);
  const status = String(payload.batchStatus || 'inactive').toLowerCase();
  const isActive = status === 'active';

  const statusLabel = isActive ? 'resumed' : 'stopped';
  const subject = `Booking update: ${trekName} booking has been ${statusLabel}`;

  const html = `
    ${buildEmailBaseStyles()}
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto;">
      <h2 style="margin-bottom: 10px;">Hello ${customerName},</h2>
      <p>Booking for this batch has been <strong>${isActive ? 'resumed' : 'temporarily stopped'}</strong> by the admin team.</p>
      <div class="sh-card">
        <p style="margin: 0 0 8px;"><strong>Booking Reference:</strong> ${bookingReference}</p>
        <p style="margin: 0 0 8px;"><strong>Trek:</strong> ${trekName}</p>
        <p style="margin: 0 0 8px;"><strong>Schedule:</strong> ${startDate} - ${endDate}</p>
        <p style="margin: 0;"><strong>Current Batch Status:</strong> ${escapeHtml(status)}</p>
      </div>
      <p style="margin-top: 16px;">For support, contact the StartHere team.</p>
      <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">This is an automated email, please do not reply.</p>
    </div>
  `;

  const text = [
    `Hello ${payload.customerName || 'Customer'},`,
    '',
    `Booking for this batch has been ${isActive ? 'resumed' : 'temporarily stopped'} by the admin team.`,
    `Booking Reference: ${payload.bookingReference || 'N/A'}`,
    `Trek: ${payload.trekName || 'N/A'}`,
    `Schedule: ${startDate} - ${endDate}`,
    `Current Batch Status: ${status}`,
    '',
    'For support, contact the StartHere team.',
  ].join('\n');

  return { subject, html, text };
}

function buildBatchCompletionSummaryEmail(payload = {}) {
  const trekName = escapeHtml(payload.trekName || 'N/A');
  const batchId = escapeHtml(payload.batchId || 'N/A');
  const startDate = formatDate(payload.startDate);
  const endDate = formatDate(payload.endDate);
  const completedBookings = Number(payload.completedBookings || 0);
  const completedParticipants = Number(payload.completedParticipants || 0);
  const processedAt = formatDate(payload.processedAt || new Date().toISOString());

  const subject = `Admin summary: batch ${batchId} marked completed`;
  const html = `
    ${buildEmailBaseStyles()}
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto;">
      <h2 style="margin-bottom: 10px;">Batch Completion Summary</h2>
      <div class="sh-card">
        <p style="margin: 0 0 8px;"><strong>Batch ID:</strong> ${batchId}</p>
        <p style="margin: 0 0 8px;"><strong>Trek:</strong> ${trekName}</p>
        <p style="margin: 0 0 8px;"><strong>Schedule:</strong> ${startDate} - ${endDate}</p>
        <p style="margin: 0 0 8px;"><strong>Completed Bookings:</strong> ${completedBookings}</p>
        <p style="margin: 0;"><strong>Completed Participants:</strong> ${completedParticipants}</p>
      </div>
      <p style="margin-top: 16px;">Processed on: ${processedAt}</p>
    </div>
  `;

  const text = [
    'Batch Completion Summary',
    '',
    `Batch ID: ${payload.batchId || 'N/A'}`,
    `Trek: ${payload.trekName || 'N/A'}`,
    `Schedule: ${startDate} - ${endDate}`,
    `Completed Bookings: ${completedBookings}`,
    `Completed Participants: ${completedParticipants}`,
    `Processed on: ${processedAt}`,
  ].join('\n');

  return { subject, html, text };
}

module.exports = {
  buildBookingCompletedEmail,
  buildBatchStatusChangedEmail,
  buildBatchCompletionSummaryEmail,
};
