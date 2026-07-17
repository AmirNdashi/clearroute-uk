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
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="font-family:'Inter',Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;">
      <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
        <div style="text-align:center;margin-bottom:30px;">
          <h1 style="color:#0D4F4F;margin:0;">ClearRoute UK</h1>
          <p style="color:#7f8c8d;margin:5px 0;">Documentation Experts</p>
        </div>
        <div style="background:#f8f9fa;border-left:4px solid #0D4F4F;padding:20px;margin:20px 0;border-radius:4px;">
          <h2 style="margin:0 0 10px 0;color:#0D4F4F;">Application Received</h2>
          <p style="margin:0;">Dear ${application.first_name} ${application.last_name},</p>
        </div>
        <p style="margin:20px 0;">Thank you for submitting your ${serviceName} application to ClearRoute UK. We have received your application and it is currently being reviewed by our team.</p>
        
        <div style="background:#fff;border:1px solid #e1e8ed;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Application Details</h3>
          <p style="margin:8px 0;"><strong>Application ID:</strong> ${application.id}</p>
          <p style="margin:8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin:8px 0;"><strong>Submitted Date:</strong> ${date}</p>
          <p style="margin:8px 0;"><strong>Status:</strong> ${application.status?.toUpperCase() || 'SUBMITTED'}</p>
        </div>

        <div style="background:#fff;border:1px solid #e1e8ed;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Personal Information</h3>
          <p style="margin:8px 0;"><strong>Full Name:</strong> ${application.first_name} ${application.last_name}</p>
          <p style="margin:8px 0;"><strong>Email:</strong> ${application.email}</p>
          ${userData?.phone ? `<p style="margin:8px 0;"><strong>Phone:</strong> ${userData.phone}</p>` : ''}
          ${userData?.date_of_birth ? `<p style="margin:8px 0;"><strong>Date of Birth:</strong> ${new Date(userData.date_of_birth).toLocaleDateString('en-GB')}</p>` : ''}
          ${userData?.nationality ? `<p style="margin:8px 0;"><strong>Nationality:</strong> ${userData.nationality}</p>` : ''}
          ${userData?.address ? `<p style="margin:8px 0;"><strong>Address:</strong> ${userData.address}</p>` : ''}
        </div>

        ${serviceDetailsSection}
        ${documentsSection}
        ${pricingSection}
        
        <div style="background:#FDFBF7;padding:20px;border-radius:8px;margin:20px 0;">
          <h3 style="margin:0 0 10px 0;color:#0D4F4F;">What Happens Next?</h3>
          <ol style="margin:10px 0;padding-left:20px;">
            <li style="margin:10px 0;">Our team will review your application within 24-48 hours</li>
            <li style="margin:10px 0;">You will receive a confirmation email with your case handler details</li>
            <li style="margin:10px 0;">If payment is required, you will receive detailed payment instructions</li>
            <li style="margin:10px 0;">We will contact you if any additional information is required</li>
          </ol>
        </div>
        
        <p style="margin:20px 0;">If you have any questions, please contact us at <a href="mailto:info@clearrouteuk.co.uk">info@clearrouteuk.co.uk</a> or WhatsApp <a href="https://wa.me/447983312575">+447983312575</a>.</p>
        
        <div style="border-top:1px solid #e1e8ed;padding-top:20px;margin-top:30px;text-align:center;color:#7f8c8d;font-size:12px;">
          <p style="margin:5px 0;">&copy; ${new Date().getFullYear()} ClearRoute UK. All rights reserved.</p>
          <p style="margin:5px 0;">This is an automated email. Please do not reply directly to this message.</p>
        </div>
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
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="font-family:'Inter',Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;">
      <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
        <div style="text-align:center;margin-bottom:30px;">
          <h1 style="color:#0D4F4F;margin:0;">ClearRoute UK</h1>
          <p style="color:#7f8c8d;margin:5px 0;">Documentation Experts</p>
        </div>
        
        <div style="background:#f8f9fa;border-left:4px solid #2E9F6E;padding:20px;margin:20px 0;border-radius:4px;">
          <h2 style="margin:0 0 10px 0;color:#0D4F4F;">Payment Invoice</h2>
          <p style="margin:0;">Dear ${application.first_name} ${application.last_name},</p>
        </div>
        
        <p style="margin:20px 0;">Thank you for choosing ClearRoute UK for your ${serviceName}. Your application has been reviewed and is ready for processing. Please find the payment details below.</p>
        
        <div style="background:#fff;border:2px solid #0D4F4F;border-radius:8px;padding:20px;margin:20px 0;">
          <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:15px;border-bottom:1px solid #e1e8ed;">
            <div>
              <p style="margin:0;color:#7f8c8d;font-size:12px;">INVOICE NUMBER</p>
              <p style="margin:0;font-weight:700;color:#0D4F4F;">${invoiceNumber}</p>
            </div>
            <div style="text-align:right;">
              <p style="margin:0;color:#7f8c8d;font-size:12px;">INVOICE DATE</p>
              <p style="margin:0;font-weight:700;color:#0D4F4F;">${invoiceDate}</p>
            </div>
          </div>
          
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Invoice Details</h3>
          <p style="margin:8px 0;"><strong>Application ID:</strong> ${application.id}</p>
          <p style="margin:8px 0;"><strong>Service:</strong> ${serviceName}</p>
          ${pricingInfo?.packageName ? `<p style="margin:8px 0;"><strong>Package:</strong> ${pricingInfo.packageName}</p>` : ''}
          
          <div style="background:#f8f9fa;padding:15px;border-radius:4px;margin:20px 0;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;"><strong>Description</strong></td>
                <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;text-align:right;"><strong>Amount</strong></td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;">${serviceName} ${pricingInfo?.packageName ? `(${pricingInfo.packageName})` : ''}</td>
                <td style="padding:10px 0;border-bottom:1px solid #e1e8ed;text-align:right;">£${pricingInfo?.totalCost || 'TBD'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#2E9F6E;"><strong>Upfront Payment Due</strong></td>
                <td style="padding:10px 0;color:#2E9F6E;text-align:right;font-weight:700;">£${pricingInfo?.upfrontPayment || 'TBD'}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#7f8c8d;">Remaining Balance</td>
                <td style="padding:10px 0;color:#7f8c8d;text-align:right;">£${pricingInfo?.remainingBalance || 'TBD'}</td>
              </tr>
            </table>
          </div>
        </div>

        <div style="background:#fff;border:1px solid #e1e8ed;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Client Information</h3>
          <p style="margin:8px 0;"><strong>Name:</strong> ${application.first_name} ${application.last_name}</p>
          <p style="margin:8px 0;"><strong>Email:</strong> ${application.email}</p>
          ${userData?.phone ? `<p style="margin:8px 0;"><strong>Phone:</strong> ${userData.phone}</p>` : ''}
          ${userData?.address ? `<p style="margin:8px 0;"><strong>Address:</strong> ${userData.address}</p>` : ''}
        </div>

        ${serviceDetailsSection}
        
        <div style="background:#FDFBF7;padding:20px;border-radius:8px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Payment Methods</h3>
          
          <div style="background:#fff;padding:15px;border-radius:4px;margin:15px 0;">
            <h4 style="margin:0 0 10px 0;color:#0D4F4F;">Bank Transfer (Preferred)</h4>
            <p style="margin:5px 0;"><strong>Account Name:</strong> ClearRoute UK</p>
            <p style="margin:5px 0;"><strong>Account Number:</strong> [Your Account Number]</p>
            <p style="margin:5px 0;"><strong>Sort Code:</strong> [Your Sort Code]</p>
            <p style="margin:5px 0;"><strong>Reference:</strong> ${application.id}</p>
          </div>
          
          <div style="background:#fff;padding:15px;border-radius:4px;margin:15px 0;">
            <h4 style="margin:0 0 10px 0;color:#0D4F4F;">Alternative Payment Methods</h4>
            <p style="margin:5px 0;">&bull; <strong>Wise Transfer:</strong> Send to info@clearrouteuk.co.uk</p>
            <p style="margin:5px 0;">&bull; <strong>PayPal:</strong> Send to info@clearrouteuk.co.uk</p>
            <p style="margin:5px 0;">&bull; <strong>WhatsApp:</strong> Contact us at +447983312575 for payment link</p>
          </div>
        </div>
        
        <div style="background:#FEF3C7;border-left:4px solid #D4735E;padding:15px;margin:20px 0;border-radius:4px;">
          <h4 style="margin:0 0 10px 0;color:#92400E;">Important Payment Notes</h4>
          <ul style="margin:10px 0;padding-left:20px;">
            <li style="margin:5px 0;">Please include <strong>Application ID (${application.id})</strong> as your payment reference</li>
            <li style="margin:5px 0;">Remaining balance of <strong>£${pricingInfo?.remainingBalance || 'TBD'}</strong> is due upon completion of key milestones</li>
            <li style="margin:5px 0;">Work commences within 24 hours of payment confirmation</li>
            <li style="margin:5px 0;">Please send payment confirmation to info@clearrouteuk.co.uk</li>
          </ul>
        </div>
        
        <p style="margin:20px 0;">If you have any questions about this invoice or payment process, please contact us at <a href="mailto:info@clearrouteuk.co.uk">info@clearrouteuk.co.uk</a> or WhatsApp <a href="https://wa.me/447983312575">+447983312575</a>.</p>
        
        <div style="border-top:1px solid #e1e8ed;padding-top:20px;margin-top:30px;text-align:center;color:#7f8c8d;font-size:12px;">
          <p style="margin:5px 0;">&copy; ${new Date().getFullYear()} ClearRoute UK. All rights reserved.</p>
          <p style="margin:5px 0;">Registered in England & Wales</p>
          <p style="margin:5px 0;">This is an automated invoice. For enquiries, please contact our team.</p>
        </div>
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
