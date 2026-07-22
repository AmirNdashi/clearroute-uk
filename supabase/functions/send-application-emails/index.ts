import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const smtpConfig = {
  hostname: Deno.env.get('SMTP_HOST') || 'mail.privateemail.com',
  port: parseInt(Deno.env.get('SMTP_PORT') || '465'),
  username: Deno.env.get('SMTP_USERNAME') || '',
  password: Deno.env.get('SMTP_PASSWORD') || '',
  from: Deno.env.get('SMTP_FROM') || 'ClearRoute UK <info@clearrouteuk.co.uk>',
}

let smtpClient: SmtpClient | null = null

let smtpError: string | null = null

async function getSmtpClient(): Promise<SmtpClient | null> {
  if (smtpError) return null
  if (!smtpConfig.username || !smtpConfig.password) {
    smtpError = 'SMTP credentials not configured'
    console.warn('SMTP credentials not configured — emails will only be logged')
    return null
  }
  if (smtpClient) return smtpClient
  try {
    smtpClient = new SmtpClient()
    await smtpClient.connectTLS({
      hostname: smtpConfig.hostname,
      port: smtpConfig.port,
      username: smtpConfig.username,
      password: smtpConfig.password,
    })
    return smtpClient
  } catch (err) {
    smtpError = String(err)
    console.error('SMTP connection failed:', err)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { application, userData, serviceData, pricingInfo, documents, emailType } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (emailType === 'receipt') {
      await sendApplicationReceiptEmail(application, userData, serviceData, pricingInfo, documents)
    } else if (emailType === 'payment') {
      await sendPaymentInvoiceEmail(application, userData, serviceData, pricingInfo, documents)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function sendEmail(to: string, subject: string, html: string) {
  const client = await getSmtpClient()
  if (client) {
    await client.send({
      from: smtpConfig.from,
      to,
      subject,
      content: html,
      html,
    })
    console.log(`Email sent to ${to}: ${subject}`)
  } else {
    console.log('EMAIL (not sent — SMTP not configured):', JSON.stringify({ to, subject }, null, 2))
  }
}

async function sendApplicationReceiptEmail(application: any, userData: any, serviceData: any, pricingInfo: any, documents: any) {
  const serviceName = getServiceDisplayName(application.service_type)
  const date = new Date(application.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  let pricingSection = ''
  if (pricingInfo && Object.keys(pricingInfo).length > 0) {
    pricingSection = `
      <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;">
        <h3 style="margin:0 0 15px 0;color:#333;">Payment Summary</h3>
        <p style="margin:5px 0;"><strong>Selected Package:</strong> ${pricingInfo.packageName || 'Standard'}</p>
        <p style="margin:5px 0;"><strong>Total Cost:</strong> £${pricingInfo.totalCost || 'TBD'}</p>
        <p style="margin:5px 0;"><strong>Upfront Payment Required:</strong> £${pricingInfo.upfrontPayment || 'TBD'}</p>
        <p style="margin:5px 0;color:#666;">You will receive a separate email with payment instructions shortly.</p>
      </div>
    `
  }

  let serviceDetailsSection = ''
  if (serviceData && Object.keys(serviceData).length > 0) {
    const serviceFields = Object.entries(serviceData)
      .filter(([key, value]) => value && key !== 'drivingPackage' && key !== 'pcoPackage')
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
        return `<p style="margin:5px 0;"><strong>${label}:</strong> ${value}</p>`
      }).join('')
    
    if (serviceFields) {
      serviceDetailsSection = `
        <div style="background:#fff;border:1px solid #e1e8ed;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Service-Specific Details</h3>
          ${serviceFields}
        </div>
      `
    }
  }

  let documentsSection = ''
  if (documents) {
    const docItems = []
    if (documents.passport_provided) docItems.push('✓ Passport / ID Document')
    if (documents.address_proof_provided) docItems.push('✓ Proof of Address')
    if (documents.additional_doc_provided) docItems.push('✓ Additional Document')
    
    if (docItems.length > 0) {
      documentsSection = `
        <div style="background:#fff;border:1px solid #e1e8ed;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Documents Submitted</h3>
          ${docItems.map(item => `<p style="margin:5px 0;">${item}</p>`).join('')}
        </div>
      `
    }
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <style>
        @media only screen and (max-width:480px) {
          .email-container { padding: 20px 12px !important; }
          .email-header { padding: 24px 12px !important; }
          .email-header h1 { font-size: 22px !important; }
          .section-box { padding: 16px !important; }
          .section-box h3 { font-size: 16px !important; }
          .footer { font-size: 11px !important; padding: 16px 12px !important; }
          .greeting-box { padding: 16px !important; }
          .greeting-box h2 { font-size: 18px !important; }
          .next-steps ol { padding-left: 16px !important; }
          .next-steps li { font-size: 13px !important; margin: 8px 0 !important; }
        }
        @media only screen and (max-width:360px) {
          .email-container { padding: 12px 8px !important; }
          .section-box { padding: 12px !important; }
        }
      </style>
    </head>
    <body style="font-family:'Inter',Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f4f6f8;">
      <div class="email-container" style="max-width:600px;margin:0 auto;padding:40px 20px;">
        
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td class="email-header" style="background:#0D4F4F;padding:32px 24px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;">ClearRoute UK</h1>
              <p style="color:#D4735E;margin:4px 0 0 0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Documentation Experts</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              
              <div class="greeting-box" style="background:#f8f9fa;border-left:4px solid #0D4F4F;padding:20px;margin-bottom:24px;border-radius:4px;">
                <h2 style="margin:0 0 8px 0;color:#0D4F4F;font-size:20px;">Application Received</h2>
                <p style="margin:0;font-size:15px;">Dear ${application.first_name} ${application.last_name},</p>
              </div>
              
              <p style="margin:0 0 24px 0;font-size:15px;color:#444;line-height:1.7;">
                Thank you for submitting your ${serviceName} application to ClearRoute UK. We have received your application and it is currently being reviewed by our team.
              </p>
              
              <div class="section-box" style="background:#fff;border:1px solid #e1e8ed;border-radius:10px;padding:24px;margin-bottom:24px;">
                <h3 style="margin:0 0 16px 0;color:#0D4F4F;font-size:17px;">Application Details</h3>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;">
                  <tr><td style="padding:4px 0;"><strong>Application ID:</strong> ${application.id}</td></tr>
                  <tr><td style="padding:4px 0;"><strong>Service:</strong> ${serviceName}</td></tr>
                  <tr><td style="padding:4px 0;"><strong>Submitted Date:</strong> ${date}</td></tr>
                  <tr><td style="padding:4px 0;"><strong>Status:</strong> ${application.status?.toUpperCase() || 'SUBMITTED'}</td></tr>
                </table>
              </div>

              <div class="section-box" style="background:#fff;border:1px solid #e1e8ed;border-radius:10px;padding:24px;margin-bottom:24px;">
                <h3 style="margin:0 0 16px 0;color:#0D4F4F;font-size:17px;">Personal Information</h3>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;">
                  <tr><td style="padding:4px 0;"><strong>Full Name:</strong> ${application.first_name} ${application.last_name}</td></tr>
                  <tr><td style="padding:4px 0;"><strong>Email:</strong> ${application.email}</td></tr>
                  ${userData?.phone ? `<tr><td style="padding:4px 0;"><strong>Phone:</strong> ${userData.phone}</td></tr>` : ''}
                  ${userData?.date_of_birth ? `<tr><td style="padding:4px 0;"><strong>Date of Birth:</strong> ${new Date(userData.date_of_birth).toLocaleDateString('en-GB')}</td></tr>` : ''}
                  ${userData?.nationality ? `<tr><td style="padding:4px 0;"><strong>Nationality:</strong> ${userData.nationality}</td></tr>` : ''}
                  ${userData?.address ? `<tr><td style="padding:4px 0;"><strong>Address:</strong> ${userData.address}</td></tr>` : ''}
                </table>
              </div>

              ${serviceDetailsSection}
              ${documentsSection}
              ${pricingSection}
              
              <div class="section-box next-steps" style="background:#FDFBF7;border:1px solid #e1e8ed;border-radius:10px;padding:24px;margin-bottom:24px;">
                <h3 style="margin:0 0 12px 0;color:#0D4F4F;font-size:17px;">What Happens Next?</h3>
                <ol style="margin:8px 0;padding-left:20px;font-size:14px;color:#444;line-height:1.7;">
                  <li style="margin:8px 0;">Our team will review your application within 24-48 hours</li>
                  <li style="margin:8px 0;">You will receive a confirmation email with your case handler details</li>
                  <li style="margin:8px 0;">If payment is required, you will receive detailed payment instructions</li>
                  <li style="margin:8px 0;">We will contact you if any additional information is required</li>
                </ol>
              </div>
              
              <p style="margin:0 0 24px 0;font-size:14px;color:#555;line-height:1.7;">
                If you have any questions, please contact us at <a href="mailto:info@clearrouteuk.co.uk" style="color:#0D4F4F;font-weight:600;">info@clearrouteuk.co.uk</a> or WhatsApp <a href="https://wa.me/447983312575" style="color:#0D4F4F;font-weight:600;">+447983312575</a>. We are here to help.
              </p>
              
              <p style="margin:0;font-size:14px;color:#555;">
                Warm regards,<br>
                <strong style="color:#0D4F4F;">The ClearRoute UK Team</strong>
              </p>
              
            </td>
          </tr>
          <tr>
            <td class="footer" style="background:#f8f9fa;padding:20px 24px;text-align:center;border-top:1px solid #e1e8ed;">
              <p style="margin:0 0 4px 0;color:#7f8c8d;font-size:12px;">&copy; ${new Date().getFullYear()} ClearRoute UK. All rights reserved.</p>
              <p style="margin:0 0 4px 0;color:#7f8c8d;font-size:12px;">Registered in England & Wales</p>
              <p style="margin:0;color:#9ca3af;font-size:11px;">This is an automated email. Please do not reply directly to this message.</p>
            </td>
          </tr>
        </table>
        
      </div>
    </body>
    </html>
  `

  await sendEmail(application.email, `Application Received - ClearRoute UK (${serviceName})`, html)
}

async function sendPaymentInvoiceEmail(application: any, userData: any, serviceData: any, pricingInfo: any, documents: any) {
  const serviceName = getServiceDisplayName(application.service_type)
  const invoiceDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const invoiceNumber = `INV-${application.id.slice(0, 8).toUpperCase()}`

  let serviceDetailsSection = ''
  if (serviceData && Object.keys(serviceData).length > 0) {
    const serviceFields = Object.entries(serviceData)
      .filter(([key, value]) => value && key !== 'drivingPackage' && key !== 'pcoPackage')
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
        return `<p style="margin:5px 0;"><strong>${label}:</strong> ${value}</p>`
      }).join('')
    
    if (serviceFields) {
      serviceDetailsSection = `
        <div style="background:#fff;border:1px solid #e1e8ed;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Service Details</h3>
          ${serviceFields}
        </div>
      `
    }
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <style>
        @media only screen and (max-width:480px) {
          .email-container { padding: 20px 12px !important; }
          .email-header { padding: 24px 12px !important; }
          .email-header h1 { font-size: 22px !important; }
          .section-box { padding: 16px !important; }
          .section-box h3 { font-size: 16px !important; }
          .invoice-header { flex-direction: column !important; gap: 10px !important; }
          .invoice-header > div { text-align: left !important; }
          .pricing-table td { padding: 8px 6px !important; font-size: 13px !important; }
          .footer { font-size: 11px !important; padding: 16px 12px !important; }
          .greeting-box { padding: 16px !important; }
          .greeting-box h2 { font-size: 18px !important; }
        }
        @media only screen and (max-width:360px) {
          .email-container { padding: 12px 8px !important; }
          .section-box { padding: 12px !important; }
          .pricing-table td { padding: 6px 4px !important; font-size: 12px !important; }
        }
      </style>
    </head>
    <body style="font-family:'Inter',Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f4f6f8;">
      <div class="email-container" style="max-width:600px;margin:0 auto;padding:40px 20px;">
        
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td class="email-header" style="background:#0D4F4F;padding:32px 24px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;">ClearRoute UK</h1>
              <p style="color:#D4735E;margin:4px 0 0 0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Documentation Experts</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              
              <div class="greeting-box" style="background:#f8f9fa;border-left:4px solid #2E9F6E;padding:20px;margin-bottom:24px;border-radius:4px;">
                <h2 style="margin:0 0 8px 0;color:#0D4F4F;font-size:20px;">Payment Invoice</h2>
                <p style="margin:0;font-size:15px;">Dear ${application.first_name} ${application.last_name},</p>
              </div>
              
              <p style="margin:0 0 24px 0;font-size:15px;color:#444;line-height:1.7;">
                Thank you for choosing ClearRoute UK for your ${serviceName}. We are pleased to let you know that your application is progressing well and is now ready for the next stage. Please find your payment invoice details below.
              </p>
              
              <div class="section-box" style="background:#fff;border:2px solid #0D4F4F;border-radius:10px;padding:24px;margin-bottom:24px;">
                
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="invoice-header" style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e1e8ed;">
                  <tr>
                    <td style="vertical-align:top;">
                      <p style="margin:0;color:#7f8c8d;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Invoice Number</p>
                      <p style="margin:2px 0 0 0;font-weight:700;color:#0D4F4F;font-size:16px;">${invoiceNumber}</p>
                    </td>
                    <td style="vertical-align:top;text-align:right;">
                      <p style="margin:0;color:#7f8c8d;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Invoice Date</p>
                      <p style="margin:2px 0 0 0;font-weight:700;color:#0D4F4F;font-size:16px;">${invoiceDate}</p>
                    </td>
                  </tr>
                </table>
                
                <h3 style="margin:0 0 16px 0;color:#0D4F4F;font-size:17px;">Invoice Details</h3>
                
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;">
                  <tr><td style="padding:4px 0;"><strong>Application ID:</strong> ${application.id}</td></tr>
                  <tr><td style="padding:4px 0;"><strong>Service:</strong> ${serviceName}</td></tr>
                  ${pricingInfo?.packageName ? `<tr><td style="padding:4px 0;"><strong>Package:</strong> ${pricingInfo.packageName}</td></tr>` : ''}
                </table>
                
                <div style="background:#f8f9fa;padding:16px;border-radius:6px;margin:20px 0 0 0;">
                  <table class="pricing-table" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;">
                    <tr>
                      <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;font-weight:600;color:#333;">Description</td>
                      <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;text-align:right;font-weight:600;color:#333;">Amount</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;color:#555;">${serviceName}${pricingInfo?.packageName ? ` (${pricingInfo.packageName})` : ''}</td>
                      <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;text-align:right;color:#555;">£${pricingInfo?.totalCost || 'TBD'}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;color:#2E9F6E;font-weight:700;">Upfront Payment Due</td>
                      <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;text-align:right;color:#2E9F6E;font-weight:700;">£${pricingInfo?.upfrontPayment || 'TBD'}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 0;color:#7f8c8d;">Remaining Balance</td>
                      <td style="padding:10px 0;text-align:right;color:#7f8c8d;">£${pricingInfo?.remainingBalance || 'TBD'}</td>
                    </tr>
                  </table>
                </div>
              </div>

              <div class="section-box" style="background:#fff;border:1px solid #e1e8ed;border-radius:10px;padding:24px;margin-bottom:24px;">
                <h3 style="margin:0 0 16px 0;color:#0D4F4F;font-size:17px;">Client Information</h3>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;">
                  <tr><td style="padding:4px 0;"><strong>Name:</strong> ${application.first_name} ${application.last_name}</td></tr>
                  <tr><td style="padding:4px 0;"><strong>Email:</strong> ${application.email}</td></tr>
                  ${userData?.phone ? `<tr><td style="padding:4px 0;"><strong>Phone:</strong> ${userData.phone}</td></tr>` : ''}
                  ${userData?.address ? `<tr><td style="padding:4px 0;"><strong>Address:</strong> ${userData.address}</td></tr>` : ''}
                </table>
              </div>

              ${serviceDetailsSection}
              
              <div class="section-box" style="background:#FDFBF7;border:1px solid #e1e8ed;border-radius:10px;padding:24px;margin-bottom:24px;">
                <h3 style="margin:0 0 16px 0;color:#0D4F4F;font-size:17px;">Payment Methods</h3>
                
                <div style="background:#fff;border:1px solid #e8eef2;padding:16px;border-radius:6px;margin-bottom:12px;">
                  <h4 style="margin:0 0 10px 0;color:#0D4F4F;font-size:14px;">Bank Transfer (Preferred)</h4>
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:13px;color:#555;">
                    <tr><td style="padding:3px 0;"><strong>Account Name:</strong> ClearRoute UK</td></tr>
                    <tr><td style="padding:3px 0;"><strong>Account Number:</strong> [Your Account Number]</td></tr>
                    <tr><td style="padding:3px 0;"><strong>Sort Code:</strong> [Your Sort Code]</td></tr>
                    <tr><td style="padding:3px 0;"><strong>Reference:</strong> ${application.id}</td></tr>
                  </table>
                </div>
                
                <div style="background:#fff;border:1px solid #e8eef2;padding:16px;border-radius:6px;">
                  <h4 style="margin:0 0 10px 0;color:#0D4F4F;font-size:14px;">Alternative Payment Methods</h4>
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:13px;color:#555;">
                    <tr><td style="padding:3px 0;">&bull; <strong>Wise Transfer:</strong> Send to info@clearrouteuk.co.uk</td></tr>
                    <tr><td style="padding:3px 0;">&bull; <strong>PayPal:</strong> Send to info@clearrouteuk.co.uk</td></tr>
                    <tr><td style="padding:3px 0;">&bull; <strong>WhatsApp:</strong> Contact us at +447983312575 for payment link</td></tr>
                  </table>
                </div>
              </div>
              
              <div style="background:#FEF3C7;border-left:4px solid #D4735E;padding:16px 20px;margin-bottom:24px;border-radius:6px;">
                <h4 style="margin:0 0 12px 0;color:#92400E;font-size:14px;">Important Payment Notes</h4>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:13px;color:#7c5e10;">
                  <tr><td style="padding:4px 0;">&bull; Please include <strong>Application ID (${application.id})</strong> as your payment reference</td></tr>
                  <tr><td style="padding:4px 0;">&bull; Remaining balance of <strong>£${pricingInfo?.remainingBalance || 'TBD'}</strong> is due upon completion of key milestones</td></tr>
                  <tr><td style="padding:4px 0;">&bull; Work commences within 24 hours of payment confirmation</td></tr>
                  <tr><td style="padding:4px 0;">&bull; Please send payment confirmation to info@clearrouteuk.co.uk</td></tr>
                </table>
              </div>
              
              <p style="margin:0 0 24px 0;font-size:14px;color:#555;line-height:1.7;">
                If you have any questions about this invoice or payment process, please contact us at <a href="mailto:info@clearrouteuk.co.uk" style="color:#0D4F4F;font-weight:600;">info@clearrouteuk.co.uk</a> or WhatsApp <a href="https://wa.me/447983312575" style="color:#0D4F4F;font-weight:600;">+447983312575</a>. We are here to help.
              </p>
              
              <p style="margin:0 0 24px 0;font-size:14px;color:#555;line-height:1.7;">
                We truly appreciate your trust in us and look forward to helping you through this process.
              </p>
              <p style="margin:0;font-size:14px;color:#555;">
                Warm regards,<br>
                <strong style="color:#0D4F4F;">The ClearRoute UK Team</strong>
              </p>
              
            </td>
          </tr>
          <tr>
            <td class="footer" style="background:#f8f9fa;padding:20px 24px;text-align:center;border-top:1px solid #e1e8ed;">
              <p style="margin:0 0 4px 0;color:#7f8c8d;font-size:12px;">&copy; ${new Date().getFullYear()} ClearRoute UK. All rights reserved.</p>
              <p style="margin:0 0 4px 0;color:#7f8c8d;font-size:12px;">Registered in England & Wales</p>
              <p style="margin:0;color:#9ca3af;font-size:11px;">This is an automated invoice. For enquiries, please contact our team.</p>
            </td>
          </tr>
        </table>
        
      </div>
    </body>
    </html>
  `

  await sendEmail(application.email, `Payment Invoice - ClearRoute UK (${invoiceNumber})`, html)
}

function getServiceDisplayName(serviceType: string): string {
  const serviceNames: { [key: string]: string } = {
    'driving-licence': 'Driving Licence Conversion',
    'ni-number': 'NI Number Application',
    'brp-evisa': 'BRP / eVisa Guidance',
    'theory-test': 'Theory Test Booking',
    'practical-test': 'Practical Test Booking',
    'address-proof': 'Address Proof Setup',
    'bank-account': 'UK Bank Account Setup',
    'pco-licence': 'PCO Licence Application'
  }
  return serviceNames[serviceType] || serviceType
}
