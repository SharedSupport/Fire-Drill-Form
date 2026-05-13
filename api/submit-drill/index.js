const { jsPDF } = require("jspdf");
const sgMail = require("@sendgrid/mail");

// Signature base64 - same one embedded in the frontend
const SIG_PATH = require("path").join(__dirname, "..", "signature.jpg");
const fs = require("fs");
let SIG_DATA;
try {
  SIG_DATA = fs.readFileSync(SIG_PATH).toString("base64");
} catch {
  SIG_DATA = null;
}

// ── RECIPIENTS ──
const RECIPIENTS = [
  { email: "cstrauser@sharedsupport.org", name: "Chrissy Strauser" },
  { email: "mtreas@sharedsupport.org", name: "Michele Treas" },
];

module.exports = async function (context, req) {
  try {
    const data = req.body;
    if (!data || !data.site || !data.drillType) {
      context.res = { status: 400, body: { error: "Missing required fields" } };
      return;
    }

    // Build narrative
    const narrative = data.narrative || buildNarrative(data);

    // Generate PDF
    const pdfBase64 = buildPDF(data, narrative);

    // Build filename
    const siteClean = data.site.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
    const fuTag = data.formType === "followup" ? "_followup" : "";
    const filename = `FireDrill_${siteClean}_${data.drillType.toLowerCase()}${fuTag}_${data.dateRaw || "report"}.pdf`;

    // Send email via SendGrid
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const subject = `Fire Drill Report - ${data.site} - ${data.date}${data.formType === "followup" ? " (Follow-Up)" : ""}`;
    const body = [
      `Fire Drill Report`,
      ``,
      `Site: ${data.site}`,
      `Date: ${data.date}`,
      `Type: ${data.drillType}${data.formType === "followup" ? " (Follow-Up)" : ""}`,
      `Individuals: ${data.individuals.join(", ")}`,
      `Reported by: ${data.reportingStaff}`,
      ``,
      `Summary:`,
      narrative,
      ``,
      `PDF report is attached.`,
      ``,
      `- Shared Support Fire Drill App`,
    ].join("\n");

    const msg = {
      to: RECIPIENTS,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || "firedrill@sharedsupport.org",
        name: "Shared Support Fire Drill App",
      },
      subject: subject,
      text: body,
      attachments: [
        {
          content: pdfBase64,
          filename: filename,
          type: "application/pdf",
          disposition: "attachment",
        },
      ],
    };

    await sgMail.send(msg);

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { success: true, filename: filename },
    };
  } catch (err) {
    context.log.error("submit-drill error:", err);
    context.res = {
      status: 500,
      body: { error: "Failed to send report. Please try again." },
    };
  }
};

// ════════════════════════════════════════
//  NARRATIVE TEMPLATE ENGINE (same as frontend)
// ════════════════════════════════════════
function buildNarrative(d) {
  const clean = (s) => (s || "").trim().replace(/\.+$/, "");
  const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  function nameList(names) {
    const f = names.map((n) => n.split(/\s+/)[0]);
    if (f.length === 1) return f[0];
    if (f.length === 2) return f[0] + " and " + f[1];
    return f.slice(0, -1).join(", ") + ", and " + f[f.length - 1];
  }

  const type = d.drillType.toLowerCase();
  const names = d.individuals;
  const firstNames = nameList(names);
  const fireLoc = clean(d.fireLocation);
  const alarmLoc = clean(d.alarmLocation);
  const route = clean(d.evacRoute);
  const response = clean(d.individualResponse);
  const meetSpot = clean(d.meetingSpot);
  const s = [];

  const prefix = d.formType === "followup" ? "A follow-up " : "A";
  s.push(
    `${prefix}${type === "asleep" ? "n asleep" : "n awake"} fire drill was conducted on ${d.day} with a simulated fire located in the ${lcFirst(fireLoc)}.`
  );
  s.push(`The ${lcFirst(alarmLoc)} was activated.`);

  if (route) {
    const sn = names.some((n) =>
      route.toLowerCase().startsWith(n.split(/\s+/)[0].toLowerCase())
    );
    if (sn) s.push(route + ".");
    else if (names.length === 1)
      s.push(`${names[0].split(/\s+/)[0]} ${lcFirst(route)}.`);
    else s.push(route.charAt(0).toUpperCase() + route.slice(1) + ".");
  }

  if (response) {
    const sn = names.some((n) =>
      response.toLowerCase().startsWith(n.split(/\s+/)[0].toLowerCase())
    );
    if (sn) s.push(response + ".");
    else if (names.length === 1)
      s.push(`${names[0].split(/\s+/)[0]} ${lcFirst(response)}.`);
    else s.push(response.charAt(0).toUpperCase() + response.slice(1) + ".");
  }

  if (d.metAtSpot === "Yes") {
    s.push(
      `${firstNames} met at the designated meeting spot at the ${lcFirst(meetSpot)}.`
    );
  } else {
    let m = `${firstNames} did not meet at the designated meeting spot.`;
    if (d.metAtSpotExplain) m += ` ${clean(d.metAtSpotExplain)}.`;
    s.push(m);
  }

  s.push(`Total evacuation time was ${d.evacTime}.`);

  if (d.concerns === "Yes" && d.concernsExplain) {
    s.push(`Areas of concern were noted: ${clean(d.concernsExplain)}.`);
  }

  return s
    .join(" ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ════════════════════════════════════════
//  PDF GENERATION (server-side jsPDF)
// ════════════════════════════════════════
function buildPDF(data, narr) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const LM = 50;
  const CW = W - 100;
  let y = 0,
    alt = false,
    pg = 1;

  const MC = [139, 26, 46],
    D = [45, 42, 38],
    G = [122, 117, 111],
    LB = [253, 248, 244],
    WH = [255, 255, 255],
    GR = [46, 125, 79],
    RD = [198, 40, 40];

  function ftr() {
    doc.setFontSize(7.5);
    doc.setTextColor(...G);
    doc.text(
      "Shared Support Inc. - Fire Drill Record - Generated " +
        new Date().toLocaleDateString(),
      LM,
      H - 25
    );
    doc.text("Page " + pg, W - 50, H - 25, { align: "right" });
  }

  function chk(n) {
    if (y + n > H - 60) {
      ftr();
      doc.addPage();
      pg++;
      y = 50;
      alt = false;
    }
  }

  // Title
  const titleSuffix = data.formType === "followup" ? " (FOLLOW-UP)" : "";
  doc.setFillColor(...MC);
  doc.rect(0, 0, W, 70, "F");
  doc.setTextColor(...WH);
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text("SHARED SUPPORT FIRE DRILL RECORD" + titleSuffix, LM, 35);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${data.site}  |  ${data.date}  |  ${data.drillType} Drill`,
    LM,
    53
  );
  y = 90;

  function sec(t) {
    chk(45);
    y += 8;
    doc.setFillColor(...MC);
    doc.roundedRect(LM, y, CW, 22, 3, 3, "F");
    doc.setTextColor(...WH);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.text(t.toUpperCase(), LM + 10, y + 15);
    y += 30;
    alt = false;
  }

  function fld(lb, val, o = {}) {
    if (!val) val = "\u2014";
    const lines = o.tall
      ? doc.splitTextToSize(String(val), CW - 155)
      : [String(val)];
    const rh = o.tall ? Math.max(20, 8 + lines.length * 12) : 20;
    chk(rh + 8);
    if (alt) {
      doc.setFillColor(...LB);
      doc.rect(LM, y - 2, CW, rh + 4, "F");
    }
    alt = !alt;
    doc.setTextColor(...G);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(lb + ":", LM + 8, y + 10);
    if (o.yn) {
      const c = val === "Yes" ? GR : val === "No" ? RD : G;
      doc.setFillColor(...c);
      doc.circle(LM + 148, y + 8, 3, "F");
      doc.setTextColor(...D);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(val, LM + 156, y + 10);
    } else {
      doc.setTextColor(...D);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      if (o.tall)
        lines.forEach((l, i) => doc.text(l, LM + 145, y + 10 + i * 12));
      else doc.text(val, LM + 145, y + 10);
    }
    y += rh + 6;
  }

  function ppl(lb, names) {
    const rh = 14 + names.length * 14;
    chk(rh + 8);
    if (alt) {
      doc.setFillColor(...LB);
      doc.rect(LM, y - 2, CW, rh + 4, "F");
    }
    alt = !alt;
    doc.setTextColor(...G);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(lb + ":", LM + 8, y + 10);
    doc.setTextColor(...D);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    names.forEach((n, i) =>
      doc.text("\u2022 " + n, LM + 145, y + 10 + i * 14)
    );
    y += rh + 6;
  }

  // Content
  sec(
    data.formType === "followup" ? "Follow-Up Drill Details" : "Site & Timing"
  );
  fld("Site Address", data.site);
  fld("Drill Type", data.drillType);
  fld("Day / Date", data.day + ", " + data.date);
  fld("Time Started", data.time);
  fld("Evacuation Time", data.evacTime);

  sec("Drill Details");
  fld("Location of Fire", data.fireLocation);
  fld("Alarm Set Off At", data.alarmLocation);
  fld("Evacuation Route", data.evacRoute, { tall: true });
  fld("Meeting Spot", data.meetingSpot);

  sec("Individual Response");
  fld("Response", data.individualResponse, { tall: true });
  fld("Met at Spot", data.metAtSpot, { yn: true });
  if (data.metAtSpot === "No")
    fld("Explanation", data.metAtSpotExplain, { tall: true });

  sec("Participants");
  ppl("Individuals", data.individuals);
  ppl("Staff", data.staff);
  fld("Reporting Staff", data.reportingStaff);

  if (data.formType === "initial") {
    sec("Safety Equipment Checks");
    fld("Areas of Concern", data.concerns, {
      yn: data.concerns !== "Yes",
    });
    if (data.concerns === "Yes")
      fld("Details", data.concernsExplain, { tall: true });
    fld("Smoke Alarms OK", data.smokeAlarms, { yn: true });
    if (data.smokeAlarms === "No")
      fld("Issues", data.smokeAlarmsExplain, { tall: true });
    fld("Extinguishers OK", data.extinguishers, { yn: true });
    if (data.extinguishers === "No")
      fld("Issues", data.extinguishersExplain, { tall: true });
    fld("Water Temp < 120\u00b0F", data.waterTemp, { yn: true });
    if (data.waterTemp === "No") {
      fld("Follow-Up Date", data.waterFollowDate || "");
      fld("Temperature", data.waterReading || "");
    }
    fld("Emergency #s Posted", data.emergencyNums, { yn: true });
    if (data.emergencyNums === "No")
      fld("Date Corrected", data.emergencyNumsDate || "");
  } else {
    sec("Equipment Recheck");
    fld("All Equipment Operative", data.fuEquip, { yn: true });
    if (data.fuEquip === "No")
      fld("Issues", data.fuEquipExplain, { tall: true });
  }

  if (data.evacSatisfactory || data.planSatisfactory || data.overallEval) {
    sec("Manager Evaluation");
    if (data.evacSatisfactory)
      fld("Evacuation Time Satisfactory", data.evacSatisfactory, {
        yn: data.evacSatisfactory !== "N/A",
      });
    if (data.planSatisfactory)
      fld("Emergency Plan Satisfactory", data.planSatisfactory, {
        yn: data.planSatisfactory !== "N/A",
      });
    if (data.overallEval) fld("Overall Evaluation", data.overallEval);
  }

  // Narrative
  sec("Comments / Narrative Summary");
  const narrLines = doc.splitTextToSize(narr, CW - 20);
  const narrH = narrLines.length * 13 + 20;
  chk(narrH + 10);
  doc.setFillColor(248, 245, 240);
  doc.roundedRect(LM, y, CW, narrH, 4, 4, "F");
  doc.setDrawColor(221, 213, 204);
  doc.roundedRect(LM, y, CW, narrH, 4, 4, "S");
  doc.setTextColor(...D);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.text(narrLines, LM + 10, y + 14);
  y += narrH + 10;

  // Signature
  chk(110);
  y += 10;
  doc.setFillColor(240, 232, 223);
  doc.rect(LM, y, CW, 20, "F");
  doc.setDrawColor(...MC);
  doc.setLineWidth(0.5);
  doc.rect(LM, y, CW, 20, "S");
  doc.setTextColor(...D);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Name", LM + 10, y + 13);
  doc.text("Signature", LM + 180, y + 13);
  doc.text("Date", LM + 380, y + 13);
  y += 20;
  doc.rect(LM, y, CW, 55, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...D);
  doc.text("Michele Treas", LM + 10, y + 22);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...G);
  doc.text("(Compliance Specialist)", LM + 10, y + 35);
  if (SIG_DATA) {
    try {
      doc.addImage(
        "data:image/jpeg;base64," + SIG_DATA,
        "JPEG",
        LM + 180,
        y + 8,
        120,
        38
      );
    } catch (e) {}
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...G);
  doc.text("___/___/______", LM + 385, y + 28);
  y += 55;

  ftr();

  // Return as base64
  return doc.output("datauristring").split(",")[1];
}
