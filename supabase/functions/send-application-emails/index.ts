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
    const { application, pricingInfo, sendPaymentEmail } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    await sendApplicationReceiptEmail(application, pricingInfo, supabase)

    if (sendPaymentEmail && pricingInfo) {
      await sendPaymentDetailsEmail(application, pricingInfo, supabase)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Emails sent successfully' }),
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

async function sendApplicationReceiptEmail(application: any, pricingInfo: any, supabase: any) {
  const serviceName = getServiceDisplayName(application.serviceType)
  const date = new Date(application.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  let pricingSection = ''
  if (pricingInfo) {
    pricingSection = `
      <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;">
        <h3 style="margin:0 0 15px 0;color:#333;">Payment Summary</h3>
        <p style="margin:5px 0;"><strong>Selected Package:</strong> ${pricingInfo.packageName}</p>
        <p style="margin:5px 0;"><strong>Total Cost:</strong> £${pricingInfo.totalCost}</p>
        <p style="margin:5px 0;"><strong>Upfront Payment Required:</strong> £${pricingInfo.upfrontPayment}</p>
        <p style="margin:5px 0;color:#666;">You will receive a separate email with payment instructions shortly.</p>
      </div>
    `
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
          <p style="margin:0;">Dear ${application.firstName} ${application.lastName},</p>
        </div>
        <p style="margin:20px 0;">Thank you for submitting your ${serviceName} application to ClearRoute UK.</p>
        <div style="background:#fff;border:1px solid #e1e8ed;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Application Details</h3>
          <p style="margin:8px 0;"><strong>Application ID:</strong> ${application.id}</p>
          <p style="margin:8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin:8px 0;"><strong>Submitted Date:</strong> ${date}</p>
          <p style="margin:8px 0;"><strong>Email:</strong> ${application.email}</p>
        </div>
        ${pricingSection}
        <div style="background:#FDFBF7;padding:20px;border-radius:8px;margin:20px 0;">
          <h3 style="margin:0 0 10px 0;color:#0D4F4F;">What Happens Next?</h3>
          <ol style="margin:10px 0;padding-left:20px;">
            <li style="margin:10px 0;">Our team will review your application within 24-48 hours</li>
            <li style="margin:10px 0;">You will receive a confirmation email with your case handler details</li>
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

async function sendPaymentDetailsEmail(application: any, pricingInfo: any, supabase: any) {
  const serviceName = getServiceDisplayName(application.serviceType)

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
          <h2 style="margin:0 0 10px 0;color:#0D4F4F;">Payment Instructions</h2>
          <p style="margin:0;">Dear ${application.firstName} ${application.lastName},</p>
        </div>
        <p style="margin:20px 0;">Thank you for choosing ClearRoute UK for your ${serviceName}. Below are the payment details.</p>
        <div style="background:#fff;border:1px solid #e1e8ed;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">Payment Summary</h3>
          <p style="margin:8px 0;"><strong>Application ID:</strong> ${application.id}</p>
          <p style="margin:8px 0;"><strong>Selected Package:</strong> ${pricingInfo.packageName}</p>
          <div style="background:#f8f9fa;padding:15px;border-radius:4px;margin:15px 0;">
            <p style="margin:8px 0;font-size:18px;"><strong>Total Cost:</strong> &pound;${pricingInfo.totalCost}</p>
            <p style="margin:8px 0;color:#2E9F6E;font-size:16px;"><strong>Upfront Payment Required:</strong> &pound;${pricingInfo.upfrontPayment}</p>
            <p style="margin:8px 0;color:#7f8c8d;"><strong>Remaining Balance:</strong> &pound;${pricingInfo.remainingBalance}</p>
          </div>
        </div>
        <div style="background:#FDFBF7;padding:20px;border-radius:8px;margin:20px 0;">
          <h3 style="margin:0 0 15px 0;color:#0D4F4F;">How to Make Payment</h3>
          <p>Please transfer the upfront payment of <strong>&pound;${pricingInfo.upfrontPayment}</strong> via:</p>
          <div style="background:#fff;padding:15px;border-radius:4px;margin:15px 0;">
            <h4 style="margin:0 0 10px 0;color:#0D4F4F;">Bank Transfer</h4>
            <p style="margin:5px 0;"><strong>Account Name:</strong> ClearRoute UK</p>
            <p style="margin:5px 0;"><strong>Account Number:</strong> [Your Account Number]</p>
            <p style="margin:5px 0;"><strong>Sort Code:</strong> [Your Sort Code]</p>
            <p style="margin:5px 0;"><strong>Reference:</strong> ${application.id}</p>
          </div>
          <div style="background:#fff;padding:15px;border-radius:4px;margin:15px 0;">
            <h4 style="margin:0 0 10px 0;color:#0D4F4F;">Alternative Methods</h4>
            <p style="margin:5px 0;">&bull; <strong>Wise:</strong> Send to info@clearrouteuk.co.uk</p>
            <p style="margin:5px 0;">&bull; <strong>PayPal:</strong> Send to info@clearrouteuk.co.uk</p>
            <p style="margin:5px 0;">&bull; <strong>WhatsApp:</strong> Contact us for a payment link</p>
          </div>
        </div>
        <div style="background:#FEF3C7;border-left:4px solid #D4735E;padding:15px;margin:20px 0;border-radius:4px;">
          <h4 style="margin:0 0 10px 0;color:#92400E;">Important Notes</h4>
          <ul style="margin:10px 0;padding-left:20px;">
            <li style="margin:5px 0;">Include Application ID (${application.id}) as the payment reference</li>
            <li style="margin:5px 0;">Remaining &pound;${pricingInfo.remainingBalance} due upon completion of key milestones</li>
            <li style="margin:5px 0;">Work commences within 24 hours of payment confirmation</li>
          </ul>
        </div>
        <p style="margin:20px 0;">Questions? Contact <a href="mailto:info@clearrouteuk.co.uk">info@clearrouteuk.co.uk</a> or WhatsApp <a href="https://wa.me/447983312575">+447983312575</a>.</p>
        <div style="border-top:1px solid #e1e8ed;padding-top:20px;margin-top:30px;text-align:center;color:#7f8c8d;font-size:12px;">
          <p style="margin:5px 0;">&copy; ${new Date().getFullYear()} ClearRoute UK</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendEmail(application.email, `Payment Instructions - ClearRoute UK`, html)
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
