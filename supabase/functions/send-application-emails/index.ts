import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { application, pricingInfo, sendPaymentEmail } = await req.json()

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Send application receipt email
    await sendApplicationReceiptEmail(application, pricingInfo)

    // Send payment details email only when explicitly requested (triggered by admin)
    if (sendPaymentEmail && pricingInfo) {
      await sendPaymentDetailsEmail(application, pricingInfo)
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

async function sendApplicationReceiptEmail(application: any, pricingInfo: any) {
  // In production, integrate with your email service (SendGrid, Mailgun, Resend, etc.)
  // For now, we'll log the email content that would be sent
  
  const emailContent = {
    to: application.email,
    subject: `Application Received - ClearRoute UK (${application.serviceType})`,
    html: generateReceiptEmailHTML(application, pricingInfo)
  }

  console.log('APPLICATION RECEIPT EMAIL:', JSON.stringify(emailContent, null, 2))
  
  // TODO: Integrate with actual email service
  // Example with Resend:
  // const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
  // await resend.emails.send({
  //   from: 'ClearRoute UK <info@clearoute.uk>',
  //   to: application.email,
  //   subject: emailContent.subject,
  //   html: emailContent.html
  // })
}

async function sendPaymentDetailsEmail(application: any, pricingInfo: any) {
  const emailContent = {
    to: application.email,
    subject: `Payment Instructions - ClearRoute UK`,
    html: generatePaymentEmailHTML(application, pricingInfo)
  }

  console.log('PAYMENT DETAILS EMAIL:', JSON.stringify(emailContent, null, 2))
  
  // TODO: Integrate with actual email service
}

function generateReceiptEmailHTML(application: any, pricingInfo: any): string {
  const serviceName = getServiceDisplayName(application.serviceType)
  const date = new Date(application.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  let pricingSection = ''
  if (pricingInfo) {
    pricingSection = `
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0 0 15px 0; color: #333;">Payment Summary</h3>
        <p style="margin: 5px 0;"><strong>Selected Package:</strong> ${pricingInfo.packageName}</p>
        <p style="margin: 5px 0;"><strong>Total Cost:</strong> £${pricingInfo.totalCost}</p>
        <p style="margin: 5px 0;"><strong>Upfront Payment Required:</strong> £${pricingInfo.upfrontPayment}</p>
        <p style="margin: 5px 0; color: #666;">You will receive a separate email with detailed payment instructions shortly.</p>
      </div>
    `
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Application Received</title>
    </head>
    <body style="font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin: 0;">ClearRoute UK</h1>
          <p style="color: #7f8c8d; margin: 5px 0;">Documentation Experts</p>
        </div>
        
        <div style="background: #f8f9fa; border-left: 4px solid #3498db; padding: 20px; margin: 20px 0; border-radius: 4px;">
          <h2 style="margin: 0 0 10px 0; color: #2c3e50;">Application Received</h2>
          <p style="margin: 0;">Dear ${application.firstName} ${application.lastName},</p>
        </div>
        
        <p style="margin: 20px 0;">Thank you for submitting your application to ClearRoute UK. We have successfully received your ${serviceName} application.</p>
        
        <div style="background: #fff; border: 1px solid #e1e8ed; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #2c3e50;">Application Details</h3>
          <p style="margin: 8px 0;"><strong>Application ID:</strong> ${application.id}</p>
          <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin: 8px 0;"><strong>Submitted Date:</strong> ${date}</p>
          <p style="margin: 8px 0;"><strong>Email:</strong> ${application.email}</p>
        </div>
        
        ${pricingSection}
        
        <div style="background: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #2c3e50;">What Happens Next?</h3>
          <ol style="margin: 10px 0; padding-left: 20px;">
            <li style="margin: 10px 0;">Our team will review your application within 24-48 hours</li>
            <li style="margin: 10px 0;">You will receive a confirmation email with your case handler details</li>
            <li style="margin: 10px 0;">We will contact you if any additional information is required</li>
            <li style="margin: 10px 0;">Your dedicated case handler will guide you through the entire process</li>
          </ol>
        </div>
        
        <p style="margin: 20px 0;">If you have any questions or need to provide additional information, please don't hesitate to contact us.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <p style="margin: 10px 0;"><strong>Contact Us</strong></p>
          <p style="margin: 5px 0;">Email: <a href="mailto:info@clearoute.uk" style="color: #3498db;">info@clearoute.uk</a></p>
          <p style="margin: 5px 0;">WhatsApp: <a href="https://wa.me/" style="color: #3498db;">Tap to Message</a></p>
        </div>
        
        <div style="border-top: 1px solid #e1e8ed; padding-top: 20px; margin-top: 30px; text-align: center; color: #7f8c8d; font-size: 12px;">
          <p style="margin: 5px 0;">© ${new Date().getFullYear()} ClearRoute UK. All rights reserved.</p>
          <p style="margin: 5px 0;">This is an automated email. Please do not reply directly to this message.</p>
        </div>
      </div>
    </body>
    </html>
  `
}

function generatePaymentEmailHTML(application: any, pricingInfo: any): string {
  const serviceName = getServiceDisplayName(application.serviceType)

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Instructions</title>
    </head>
    <body style="font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin: 0;">ClearRoute UK</h1>
          <p style="color: #7f8c8d; margin: 5px 0;">Documentation Experts</p>
        </div>
        
        <div style="background: #f8f9fa; border-left: 4px solid #27ae60; padding: 20px; margin: 20px 0; border-radius: 4px;">
          <h2 style="margin: 0 0 10px 0; color: #2c3e50;">Payment Instructions</h2>
          <p style="margin: 0;">Dear ${application.firstName} ${application.lastName},</p>
        </div>
        
        <p style="margin: 20px 0;">Thank you for choosing ClearRoute UK for your ${serviceName}. Below are the payment details for your selected package.</p>
        
        <div style="background: #fff; border: 1px solid #e1e8ed; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #2c3e50;">Payment Summary</h3>
          <p style="margin: 8px 0;"><strong>Application ID:</strong> ${application.id}</p>
          <p style="margin: 8px 0;"><strong>Selected Package:</strong> ${pricingInfo.packageName}</p>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0;">
            <p style="margin: 8px 0; font-size: 18px;"><strong>Total Cost:</strong> £${pricingInfo.totalCost}</p>
            <p style="margin: 8px 0; color: #27ae60; font-size: 16px;"><strong>Upfront Payment Required:</strong> £${pricingInfo.upfrontPayment}</p>
            <p style="margin: 8px 0; color: #7f8c8d;"><strong>Remaining Balance:</strong> £${pricingInfo.remainingBalance}</p>
          </div>
        </div>
        
        <div style="background: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #2c3e50;">How to Make Payment</h3>
          <p style="margin: 10px 0;">Please transfer the upfront payment of <strong>£${pricingInfo.upfrontPayment}</strong> using one of the following methods:</p>
          
          <div style="background: #fff; padding: 15px; border-radius: 4px; margin: 15px 0;">
            <h4 style="margin: 0 0 10px 0; color: #2c3e50;">Bank Transfer</h4>
            <p style="margin: 5px 0;"><strong>Account Name:</strong> ClearRoute UK</p>
            <p style="margin: 5px 0;"><strong>Account Number:</strong> [Your Account Number]</p>
            <p style="margin: 5px 0;"><strong>Sort Code:</strong> [Your Sort Code]</p>
            <p style="margin: 5px 0;"><strong>Reference:</strong> ${application.id}</p>
          </div>
          
          <div style="background: #fff; padding: 15px; border-radius: 4px; margin: 15px 0;">
            <h4 style="margin: 0 0 10px 0; color: #2c3e50;">Alternative Payment Methods</h4>
            <p style="margin: 5px 0;">• <strong>Wise Transfer:</strong> Send to info@clearoute.uk</p>
            <p style="margin: 5px 0;">• <strong>PayPal:</strong> Send to info@clearoute.uk</p>
            <p style="margin: 5px 0;">• <strong>WhatsApp Payment:</strong> Contact us for payment link</p>
          </div>
        </div>
        
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <h4 style="margin: 0 0 10px 0; color: #856404;">Important Notes</h4>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li style="margin: 5px 0;">Please include your Application ID (${application.id}) as the payment reference</li>
            <li style="margin: 5px 0;">The remaining balance of £${pricingInfo.remainingBalance} will be due upon completion of key milestones</li>
            <li style="margin: 5px 0;">You will receive a confirmation email once your payment is received</li>
            <li style="margin: 5px 0;">Work on your application will commence within 24 hours of payment confirmation</li>
          </ul>
        </div>
        
        <p style="margin: 20px 0;">If you have any questions about payment or need assistance, please contact our team.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <p style="margin: 10px 0;"><strong>Contact Us</strong></p>
          <p style="margin: 5px 0;">Email: <a href="mailto:info@clearoute.uk" style="color: #3498db;">info@clearoute.uk</a></p>
          <p style="margin: 5px 0;">WhatsApp: <a href="https://wa.me/" style="color: #3498db;">Tap to Message</a></p>
        </div>
        
        <div style="border-top: 1px solid #e1e8ed; padding-top: 20px; margin-top: 30px; text-align: center; color: #7f8c8d; font-size: 12px;">
          <p style="margin: 5px 0;">© ${new Date().getFullYear()} ClearRoute UK. All rights reserved.</p>
          <p style="margin: 5px 0;">This is an automated email. Please do not reply directly to this message.</p>
        </div>
      </div>
    </body>
    </html>
  `
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
