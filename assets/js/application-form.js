/* ============================================================
   CLEARROUTE UK — APPLICATION FORM FUNCTIONALITY
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  let supabase;
  try {
    supabase = await window.getSupabase();
  } catch {
    document.querySelector('main').innerHTML = '<div style="text-align:center;padding:80px 20px;color:#EF4444;"><i class="fas fa-exclamation-triangle" style="font-size:3rem;margin-bottom:20px;"></i><h2>Connection Error</h2><p style="color:#6B7280;margin-top:12px;">Failed to connect. Please refresh the page.</p></div>';
    return;
  }
  
  // Check authentication
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    session = { user };
  }

  // Get service type from URL
  const urlParams = new URLSearchParams(window.location.search);
  const serviceType = urlParams.get('service') || 'driving-licence';
  
  // Load user profile
  await loadUserProfile(supabase, session.user.id);
  
  // Setup form based on service type
  setupServiceForm(serviceType);
  
  // Setup multi-step form
  setupMultiStepForm();
  
  // Setup file uploads
  setupFileUploads();
  
  // Back button handler
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
  
  // Form submission
  document.getElementById('applicationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitApplication(supabase, session.user.id, serviceType);
  });
});

async function loadUserProfile(supabase, userId) {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    
    if (profile) {
      document.getElementById('firstName').value = profile.first_name || '';
      document.getElementById('lastName').value = profile.last_name || '';
      document.getElementById('email').value = profile.email || '';
      document.getElementById('phone').value = profile.phone || '';
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

function setupServiceForm(serviceType) {
  const serviceConfig = {
    'driving-licence': {
      title: 'Driving Licence Conversion Application',
      subtitle: 'Convert your foreign driving licence to a UK licence',
      estimatedTime: '4-8 weeks',
      fields: `
        <div class="form-group">
          <label for="foreignLicenceNumber">Foreign Licence Number *</label>
          <input type="text" id="foreignLicenceNumber" name="foreignLicenceNumber" required placeholder="Enter your foreign licence number" />
        </div>
        <div class="form-group">
          <label for="issuingCountry">Issuing Country *</label>
          <input type="text" id="issuingCountry" name="issuingCountry" required placeholder="Country that issued your licence" />
        </div>
        <div class="form-group">
          <label for="licenceIssueDate">Issue Date *</label>
          <input type="date" id="licenceIssueDate" name="licenceIssueDate" required />
        </div>
        <div class="form-group">
          <label for="licenceExpiryDate">Expiry Date *</label>
          <input type="date" id="licenceExpiryDate" name="licenceExpiryDate" required />
        </div>
        <div class="form-group full-width">
          <label for="drivingExperience">Years of Driving Experience *</label>
          <input type="number" id="drivingExperience" name="drivingExperience" required min="0" placeholder="Number of years" />
        </div>
      `,
      documents: [
        'Valid foreign driving licence (both sides)',
        'Passport or national ID',
        'Proof of UK address (utility bill or bank statement)',
        'Passport-sized photo'
      ]
    },
    'ni-number': {
      title: 'NI Number Application',
      subtitle: 'Apply for your National Insurance number',
      estimatedTime: '2-4 weeks',
      fields: `
        <div class="form-group">
          <label for="employmentStatus">Employment Status *</label>
          <select id="employmentStatus" name="employmentStatus" required>
            <option value="">Select status</option>
            <option value="employed">Employed</option>
            <option value="self-employed">Self-employed</option>
            <option value="job-seeking">Job seeking</option>
            <option value="student">Student</option>
          </select>
        </div>
        <div class="form-group">
          <label for="employerName">Employer Name (if employed)</label>
          <input type="text" id="employerName" name="employerName" placeholder="Company name" />
        </div>
        <div class="form-group full-width">
          <label for="reasonForNI">Reason for NI Number *</label>
          <textarea id="reasonForNI" name="reasonForNI" rows="3" required placeholder="Explain why you need an NI number"></textarea>
        </div>
      `,
      documents: [
        'Passport or national ID',
        'Birth certificate',
        'Proof of address (utility bill or bank statement)',
        'Employment contract or job offer letter (if applicable)'
      ]
    },
    'brp-evisa': {
      title: 'BRP / eVisa Guidance Application',
      subtitle: 'Biometric Residence Permit and eVisa support',
      estimatedTime: '1-3 weeks',
      fields: `
        <div class="form-group">
          <label for="visaType">Visa Type *</label>
          <select id="visaType" name="visaType" required>
            <option value="">Select visa type</option>
            <option value="work">Work Visa</option>
            <option value="study">Student Visa</option>
            <option value="family">Family Visa</option>
            <option value="settlement">Settlement Visa</option>
          </select>
        </div>
        <div class="form-group">
          <label for="brpExpiryDate">BRP Expiry Date *</label>
          <input type="date" id="brpExpiryDate" name="brpExpiryDate" required />
        </div>
        <div class="form-group full-width">
          <label for="brpIssue">BRP Issue Description *</label>
          <textarea id="brpIssue" name="brpIssue" rows="3" required placeholder="Describe your BRP/eVisa situation"></textarea>
        </div>
      `,
      documents: [
        'Current BRP card (both sides)',
        'Passport',
        'Biometric residence permit',
        'Visa grant letter'
      ]
    },
    'theory-test': {
      title: 'Theory Test Booking Application',
      subtitle: 'Book your theory test with study support',
      estimatedTime: '1-2 weeks',
      fields: `
        <div class="form-group">
          <label for="testCentre">Preferred Test Centre *</label>
          <input type="text" id="testCentre" name="testCentre" required placeholder="City or test centre name" />
        </div>
        <div class="form-group">
          <label for="preferredDate">Preferred Date *</label>
          <input type="date" id="preferredDate" name="preferredDate" required />
        </div>
        <div class="form-group">
          <label for="licenceNumber">UK Licence Number (if you have one)</label>
          <input type="text" id="licenceNumber" name="licenceNumber" placeholder="Enter if available" />
        </div>
        <div class="form-group full-width">
          <label for="testPreparation">Test Preparation Level *</label>
          <select id="testPreparation" name="testPreparation" required>
            <option value="">Select level</option>
            <option value="beginner">Beginner - need full preparation</option>
            <option value="intermediate">Intermediate - some study done</option>
            <option value="advanced">Advanced - ready to test</option>
          </select>
        </div>
      `,
      documents: [
        'Provisional driving licence (if you have one)',
        'Passport or national ID',
        'Proof of address'
      ]
    },
    'practical-test': {
      title: 'Practical Test Booking Application',
      subtitle: 'Book your practical driving test',
      estimatedTime: '2-6 weeks',
      fields: `
        <div class="form-group">
          <label for="testCentre">Preferred Test Centre *</label>
          <input type="text" id="testCentre" name="testCentre" required placeholder="City or test centre name" />
        </div>
        <div class="form-group">
          <label for="preferredDate">Preferred Date *</label>
          <input type="date" id="preferredDate" name="preferredDate" required />
        </div>
        <div class="form-group">
          <label for="theoryTestPassDate">Theory Test Pass Date *</label>
          <input type="date" id="theoryTestPassDate" name="theoryTestPassDate" required />
        </div>
        <div class="form-group">
          <label for="licenceNumber">UK Licence Number *</label>
          <input type="text" id="licenceNumber" name="licenceNumber" required placeholder="Enter your UK licence number" />
        </div>
      `,
      documents: [
        'UK provisional driving licence',
        'Theory test pass certificate',
        'Passport or national ID'
      ]
    },
    'address-proof': {
      title: 'Address Proof Setup Application',
      subtitle: 'Establish verifiable UK address documentation',
      estimatedTime: '1-2 weeks',
      fields: `
        <div class="form-group">
          <label for="addressType">Address Type *</label>
          <select id="addressType" name="addressType" required>
            <option value="">Select type</option>
            <option value="rental">Rental Property</option>
            <option value="owned">Owned Property</option>
            <option value="shared">Shared Accommodation</option>
            <option value="temporary">Temporary Address</option>
          </select>
        </div>
        <div class="form-group">
          <label for="moveInDate">Move-in Date *</label>
          <input type="date" id="moveInDate" name="moveInDate" required />
        </div>
        <div class="form-group full-width">
          <label for="addressPurpose">Purpose of Address Proof *</label>
          <textarea id="addressPurpose" name="addressPurpose" rows="3" required placeholder="What do you need address proof for?"></textarea>
        </div>
      `,
      documents: [
        'Tenancy agreement or mortgage statement',
        'Utility bill (gas, electricity, water)',
        'Council tax bill',
        'Bank statement showing address'
      ]
    },
    'bank-account': {
      title: 'UK Bank Account Setup Application',
      subtitle: 'Guidance for opening a UK bank account',
      estimatedTime: '1-2 weeks',
      fields: `
        <div class="form-group">
          <label for="accountType">Account Type Preference *</label>
          <select id="accountType" name="accountType" required>
            <option value="">Select type</option>
            <option value="current">Current Account</option>
            <option value="savings">Savings Account</option>
            <option value="both">Both Current and Savings</option>
          </select>
        </div>
        <div class="form-group">
          <label for="employmentStatus">Employment Status *</label>
          <select id="employmentStatus" name="employmentStatus" required>
            <option value="">Select status</option>
            <option value="employed">Employed</option>
            <option value="self-employed">Self-employed</option>
            <option value="student">Student</option>
            <option value="unemployed">Unemployed</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label for="bankingNeeds">Banking Requirements *</label>
          <textarea id="bankingNeeds" name="bankingNeeds" rows="3" required placeholder="Describe your banking needs"></textarea>
        </div>
      `,
      documents: [
        'Passport or national ID',
        'Proof of address (utility bill or bank statement)',
        'Proof of income (payslips or tax returns)',
        'Visa or immigration documents'
      ]
    }
  };

  const config = serviceConfig[serviceType] || serviceConfig['driving-licence'];
  
  document.getElementById('formTitle').textContent = config.title;
  document.getElementById('formSubtitle').textContent = config.subtitle;
  document.getElementById('estimatedTime').textContent = config.estimatedTime;
  
  document.getElementById('serviceSpecificFields').innerHTML = config.fields;
  
  const documentsHTML = config.documents.map(doc => `
    <li><i class="fas fa-check-circle"></i> ${doc}</li>
  `).join('');
  
  document.getElementById('documentRequirements').innerHTML = `
    <h3>Required Documents</h3>
    <ul>${documentsHTML}</ul>
  `;
}

function setupMultiStepForm() {
  const steps = document.querySelectorAll('.form-step');
  const stepItems = document.querySelectorAll('.step-item');
  const nextBtns = document.querySelectorAll('.next-step-btn');
  const prevBtns = document.querySelectorAll('.prev-step-btn');
  
  let currentStep = 1;
  let completedSteps = new Set(); // Track which steps have been validated
  
  nextBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        completedSteps.add(currentStep);
        goToStep(currentStep + 1);
      }
    });
  });
  
  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      goToStep(currentStep - 1);
    });
  });
  
  // Make step items clickable for navigation
  stepItems.forEach(item => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      const targetStep = parseInt(item.dataset.step);
      
      // Allow going back to any previous step
      if (targetStep < currentStep) {
        goToStep(targetStep);
      }
      // Allow going forward only if all previous steps are completed
      else if (targetStep > currentStep) {
        let canProceed = true;
        for (let i = 1; i < targetStep; i++) {
          if (!completedSteps.has(i)) {
            canProceed = false;
            break;
          }
        }
        
        if (canProceed) {
          goToStep(targetStep);
        } else {
          alert('Please complete all previous steps before proceeding to this step.');
        }
      }
    });
  });
  
  function goToStep(step) {
    // Update form steps
    steps.forEach(s => s.classList.remove('active'));
    document.querySelector(`.form-step[data-step="${step}"]`).classList.add('active');
    
    // Update progress indicators
    stepItems.forEach(item => {
      const itemStep = parseInt(item.dataset.step);
      item.classList.remove('active', 'completed');
      if (itemStep === step) {
        item.classList.add('active');
      } else if (itemStep < step) {
        item.classList.add('completed');
      }
    });
    
    currentStep = step;
    
    // Update review section on step 4
    if (step === 4) {
      updateReviewSection();
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  function validateStep(step) {
    const currentFormStep = document.querySelector(`.form-step[data-step="${step}"]`);
    const requiredFields = currentFormStep.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
      if (!field.value.trim()) {
        isValid = false;
        field.style.borderColor = '#dc2626';
      } else {
        field.style.borderColor = '';
      }
    });
    
    if (!isValid) {
      alert('Please fill in all required fields');
    }
    
    return isValid;
  }
}

function setupFileUploads() {
  const fileInputs = document.querySelectorAll('input[type="file"]');
  
  fileInputs.forEach(input => {
    const uploadContainer = input.closest('.file-upload');
    const label = uploadContainer.querySelector('.file-upload-label');
    const preview = uploadContainer.querySelector('.file-upload-preview');
    
    // Make label clickable to trigger file input
    if (label) {
      label.addEventListener('click', () => {
        input.click();
      });
    }
    
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          alert('File size must be less than 10MB');
          input.value = '';
          uploadContainer.classList.remove('has-file');
          return;
        }
        
        uploadContainer.classList.add('has-file');
        if (preview) {
          const fileName = preview.querySelector('.file-name');
          const fileSize = preview.querySelector('.file-size');
          if (fileName) fileName.textContent = file.name;
          if (fileSize) fileSize.textContent = formatFileSize(file.size);
        }
      }
    });
    
    if (preview) {
      const removeBtn = preview.querySelector('.remove-file');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          input.value = '';
          uploadContainer.classList.remove('has-file');
        });
      }
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateReviewSection() {
  const formData = new FormData(document.getElementById('applicationForm'));
  const reviewHTML = `
    <h3>Application Summary</h3>
    <div class="review-item">
      <span class="review-label">Service Type</span>
      <span class="review-value">${escapeHtml(document.getElementById('formTitle').textContent)}</span>
    </div>
    <div class="review-item">
      <span class="review-label">Full Name</span>
      <span class="review-value">${escapeHtml(formData.get('firstName'))} ${escapeHtml(formData.get('lastName'))}</span>
    </div>
    <div class="review-item">
      <span class="review-label">Email</span>
      <span class="review-value">${escapeHtml(formData.get('email'))}</span>
    </div>
    <div class="review-item">
      <span class="review-label">Phone</span>
      <span class="review-value">${escapeHtml(formData.get('phone'))}</span>
    </div>
    <div class="review-item">
      <span class="review-label">Date of Birth</span>
      <span class="review-value">${escapeHtml(formData.get('dateOfBirth'))}</span>
    </div>
    <div class="review-item">
      <span class="review-label">Nationality</span>
      <span class="review-value">${escapeHtml(formData.get('nationality'))}</span>
    </div>
    <div class="review-item">
      <span class="review-label">Address</span>
      <span class="review-value">${escapeHtml(formData.get('address'))}</span>
    </div>
    
    <div class="review-documents">
      <h4>Documents to be uploaded</h4>
      <div class="review-doc-list">
        <div class="review-doc-item"><i class="fas fa-check-circle"></i> Passport / ID Document</div>
        <div class="review-doc-item"><i class="fas fa-check-circle"></i> Proof of Address</div>
        ${document.getElementById('additionalUpload').files[0] ? '<div class="review-doc-item"><i class="fas fa-check-circle"></i> Additional Document</div>' : ''}
      </div>
    </div>
  `;
  
  document.getElementById('reviewSection').innerHTML = reviewHTML;
}

async function submitApplication(supabase, userId, serviceType) {
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  
  try {
    const formData = new FormData(document.getElementById('applicationForm'));
    
    // Create application record
    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert([{
        user_id: userId,
        service_type: serviceType,
        status: 'submitted',
        first_name: formData.get('firstName'),
        last_name: formData.get('lastName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        date_of_birth: formData.get('dateOfBirth'),
        nationality: formData.get('nationality'),
        address: formData.get('address'),
        additional_info: formData.get('additionalInfo'),
        service_data: getServiceFormData(formData),
        estimated_completion: getEstimatedCompletion(serviceType),
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (appError) throw appError;
    
    // Upload documents to Supabase Storage
    const passportFile = document.getElementById('passportUpload').files[0];
    const addressProofFile = document.getElementById('addressUpload').files[0];
    const additionalDocFile = document.getElementById('additionalUpload').files[0];
    
    let passportPath = null;
    let addressProofPath = null;
    let additionalDocPath = null;
    
    // Upload passport
    if (passportFile) {
      const fileName = `${application.id}/passport_${Date.now()}_${passportFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, passportFile);
      
      if (uploadError) {
        console.error('Passport upload error:', uploadError);
      } else {
        passportPath = fileName;
      }
    }
    
    // Upload address proof
    if (addressProofFile) {
      const fileName = `${application.id}/address_proof_${Date.now()}_${addressProofFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, addressProofFile);
      
      if (uploadError) {
        console.error('Address proof upload error:', uploadError);
      } else {
        addressProofPath = fileName;
      }
    }
    
    // Upload additional document
    if (additionalDocFile) {
      const fileName = `${application.id}/additional_${Date.now()}_${additionalDocFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, additionalDocFile);
      
      if (uploadError) {
        console.error('Additional doc upload error:', uploadError);
      } else {
        additionalDocPath = fileName;
      }
    }
    
    // Record document information in database
    const { error: docsError } = await supabase
      .from('application_documents')
      .insert([{
        application_id: application.id,
        passport_provided: !!passportFile,
        address_proof_provided: !!addressProofFile,
        additional_doc_provided: !!additionalDocFile,
        passport_file_path: passportPath,
        address_proof_file_path: addressProofPath,
        additional_doc_file_path: additionalDocPath,
        created_at: new Date().toISOString()
      }]);
    
    if (docsError) console.error('Document recording error:', docsError);
    
    // Send notification email (in real implementation)
    await sendNotificationEmail(application);
    
    alert('Application submitted successfully! You will be redirected to your dashboard.');
    window.location.href = 'dashboard.html';
    
  } catch (error) {
    console.error('Submission error:', error);
    alert('Error submitting application: ' + error.message);
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application';
  }
}

function getServiceFormData(formData) {
  // Extract service-specific fields
  const serviceData = {};
  const serviceFields = [
    'foreignLicenceNumber', 'issuingCountry', 'licenceIssueDate', 'licenceExpiryDate', 'drivingExperience',
    'employmentStatus', 'employerName', 'reasonForNI',
    'visaType', 'brpExpiryDate', 'brpIssue',
    'testCentre', 'preferredDate', 'licenceNumber', 'testPreparation', 'theoryTestPassDate',
    'addressType', 'moveInDate', 'addressPurpose',
    'accountType', 'bankingNeeds'
  ];
  
  serviceFields.forEach(field => {
    if (formData.get(field)) {
      serviceData[field] = formData.get(field);
    }
  });
  
  return serviceData;
}

function getEstimatedCompletion(serviceType) {
  const estimates = {
    'driving-licence': 42, // 6 weeks
    'ni-number': 21, // 3 weeks
    'brp-evisa': 14, // 2 weeks
    'theory-test': 10, // 1.5 weeks
    'practical-test': 28, // 4 weeks
    'address-proof': 10, // 1.5 weeks
    'bank-account': 10 // 1.5 weeks
  };
  
  const days = estimates[serviceType] || 21;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function sendNotificationEmail(application) {
  // In a real implementation, this would use a service like SendGrid, Mailgun, or Supabase Edge Functions
  console.log('Sending notification email for application:', application.id);
  // Placeholder for email functionality
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
