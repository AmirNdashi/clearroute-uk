/* ============================================================
   CLEARROUTE UK — APPLICATION PROGRESS FUNCTIONALITY
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

  // Get application ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const applicationId = urlParams.get('id');
  
  if (!applicationId) {
    alert('No application ID provided');
    window.location.href = 'dashboard.html';
    return;
  }

  // Load application data
  await loadApplicationData(supabase, applicationId, session.user.id);
  
  // Back button handler
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  }
});

async function loadApplicationData(supabase, applicationId, userId) {
  try {
    // Load application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .eq('user_id', userId)
      .single();
    
    if (appError) throw appError;
    
    if (!application) {
      alert('Application not found');
      window.location.href = 'dashboard.html';
      return;
    }

    // Load documents
    const { data: documents, error: docsError } = await supabase
      .from('application_documents')
      .select('*')
      .eq('application_id', applicationId)
      .single();
    
    if (docsError) console.error('Documents error:', docsError);

    // Load admin notes
    const { data: notes, error: notesError } = await supabase
      .from('application_notes')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });
    
    if (notesError) console.error('Notes error:', notesError);

    // Update UI
    updateApplicationHeader(application);
    updateProgressTimeline(application);
    updateApplicationDetails(application);
    updateDocumentsList(documents);
    updateAdminNotes(notes);
    updateResultSection(application);
    updateEstimatedCompletion(application);
    
    // Set up real-time subscription for this specific application
    setupRealtimeSubscription(supabase, applicationId, userId);
    
  } catch (error) {
    console.error('Error loading application:', error);
    alert('Error loading application data');
  }
}

function setupRealtimeSubscription(supabase, applicationId, userId) {
  // Subscribe to changes in the applications table for this specific application
  const subscription = supabase
    .channel(`application-${applicationId}-changes`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE', // Listen to UPDATE events
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${applicationId}`
      },
      (payload) => {
        console.log('Application status changed:', payload);
        // Reload application data when changes occur
        loadApplicationData(supabase, applicationId, userId);
      }
    )
    .subscribe();
  
  // Store subscription reference for cleanup
  window.applicationSubscription = subscription;
}

function updateApplicationHeader(application) {
  const serviceNames = {
    'driving-licence': 'Driving Licence Conversion',
    'ni-number': 'NI Number Application',
    'brp-evisa': 'BRP / eVisa Guidance',
    'theory-test': 'Theory Test Booking',
    'practical-test': 'Practical Test Booking',
    'address-proof': 'Address Proof Setup',
    'bank-account': 'UK Bank Account Setup'
  };

  document.getElementById('appServiceName').textContent = serviceNames[application.service_type] || application.service_type;
  document.getElementById('appServiceDescription').textContent = `Application submitted on ${formatDate(application.created_at)}`;
  document.getElementById('appStatus').textContent = formatStatus(application.status);
  document.getElementById('appStatus').className = `status-badge ${getStatusClass(application.status)}`;
  document.getElementById('appId').textContent = `ID: ${application.id.slice(0, 8)}...`;
}

function updateProgressTimeline(application) {
  const timelineSteps = [
    {
      key: 'submitted',
      title: 'Application Submitted',
      description: 'Your application has been received and is pending review.',
      icon: 'fa-paper-plane'
    },
    {
      key: 'in_review',
      title: 'Under Review',
      description: 'Our team is reviewing your application and documents.',
      icon: 'fa-search'
    },
    {
      key: 'additional_info',
      title: 'Additional Information Requested',
      description: 'We may need additional information or documents.',
      icon: 'fa-info-circle'
    },
    {
      key: 'processing',
      title: 'Processing',
      description: 'Your application is being processed by the relevant authorities.',
      icon: 'fa-cog'
    },
    {
      key: 'completed',
      title: 'Completed',
      description: 'Your application has been processed.',
      icon: 'fa-check-circle'
    }
  ];

  const statusOrder = ['submitted', 'in_review', 'additional_info', 'processing', 'completed', 'approved', 'rejected'];
  const currentIndex = statusOrder.indexOf(application.status);

  const timelineHTML = timelineSteps.map((step, index) => {
    let status = 'pending';
    if (index < currentIndex) {
      status = 'completed';
    } else if (index === currentIndex) {
      status = 'current';
    }

    return `
      <div class="timeline-item ${status}">
        <div class="timeline-icon">
          <i class="fas ${step.icon}"></i>
        </div>
        <div class="timeline-content">
          <div class="timeline-title">${step.title}</div>
          <div class="timeline-date">${status === 'completed' ? 'Completed' : status === 'current' ? 'In Progress' : 'Pending'}</div>
          <div class="timeline-description">${step.description}</div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('progressTimeline').innerHTML = timelineHTML;
}

function updateApplicationDetails(application) {
  const detailsHTML = `
    <div class="detail-item">
      <div class="detail-label">Full Name</div>
      <div class="detail-value">${application.first_name} ${application.last_name}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Email</div>
      <div class="detail-value">${application.email}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Phone</div>
      <div class="detail-value">${application.phone}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Date of Birth</div>
      <div class="detail-value">${formatDate(application.date_of_birth)}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Nationality</div>
      <div class="detail-value">${application.nationality}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Address</div>
      <div class="detail-value">${application.address}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Application Date</div>
      <div class="detail-value">${formatDate(application.created_at)}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Status</div>
      <div class="detail-value">${formatStatus(application.status)}</div>
    </div>
  `;

  document.getElementById('applicationDetails').innerHTML = detailsHTML;
}

function updateDocumentsList(documents) {
  if (!documents) {
    document.getElementById('documentsList').innerHTML = '<p style="color: var(--text-muted);">No documents information available</p>';
    return;
  }

  const docsHTML = `
    <div class="document-item">
      <div class="document-icon">
        <i class="fas fa-passport"></i>
      </div>
      <div class="document-info">
        <div class="document-name">Passport / ID Document</div>
        <div class="document-status ${documents.passport_provided ? 'verified' : 'pending'}">
          ${documents.passport_provided ? '<i class="fas fa-check-circle"></i> Uploaded' : '<i class="fas fa-clock"></i> Pending'}
        </div>
      </div>
    </div>
    <div class="document-item">
      <div class="document-icon">
        <i class="fas fa-home"></i>
      </div>
      <div class="document-info">
        <div class="document-name">Proof of Address</div>
        <div class="document-status ${documents.address_proof_provided ? 'verified' : 'pending'}">
          ${documents.address_proof_provided ? '<i class="fas fa-check-circle"></i> Uploaded' : '<i class="fas fa-clock"></i> Pending'}
        </div>
      </div>
    </div>
    ${documents.additional_doc_provided ? `
      <div class="document-item">
        <div class="document-icon">
          <i class="fas fa-file-alt"></i>
        </div>
        <div class="document-info">
          <div class="document-name">Additional Document</div>
          <div class="document-status verified">
            <i class="fas fa-check-circle"></i> Uploaded
          </div>
        </div>
      </div>
    ` : ''}
  `;

  document.getElementById('documentsList').innerHTML = docsHTML;
}

function updateAdminNotes(notes) {
  if (!notes || notes.length === 0) {
    document.getElementById('adminNotesSection').style.display = 'none';
    return;
  }

  document.getElementById('adminNotesSection').style.display = 'block';

  const notesHTML = notes.map(note => `
    <div class="note-item">
      <div class="note-header">
        <span class="note-author">${note.admin_name || 'Admin'}</span>
        <span class="note-date">${formatDate(note.created_at)}</span>
      </div>
      <div class="note-content">${note.note}</div>
    </div>
  `).join('');

  document.getElementById('adminNotes').innerHTML = notesHTML;
}

function updateResultSection(application) {
  const resultSection = document.getElementById('resultSection');
  const resultCard = document.getElementById('resultCard');

  if (application.status === 'approved') {
    resultSection.style.display = 'block';
    resultCard.className = 'result-card approved';
    resultCard.innerHTML = `
      <div class="result-icon">
        <i class="fas fa-check"></i>
      </div>
      <div class="result-title">Application Approved!</div>
      <div class="result-message">
        Congratulations! Your application has been approved. You will receive an email with detailed instructions and next steps.
      </div>
      <div class="result-actions">
        <button class="btn btn-primary" onclick="window.print()">
          <i class="fas fa-print"></i> Print Confirmation
        </button>
        <a href="dashboard.html" class="btn btn-secondary">
          <i class="fas fa-arrow-left"></i> Back to Dashboard
        </a>
      </div>
    `;
  } else if (application.status === 'rejected') {
    resultSection.style.display = 'block';
    resultCard.className = 'result-card rejected';
    resultCard.innerHTML = `
      <div class="result-icon">
        <i class="fas fa-times"></i>
      </div>
      <div class="result-title">Application Not Approved</div>
      <div class="result-message">
        ${application.rejection_reason || 'Unfortunately, your application could not be approved at this time. Please check the admin notes for more details.'}
      </div>
      <div class="result-actions">
        <a href="dashboard.html" class="btn btn-primary">
          <i class="fas fa-plus"></i> Submit New Application
        </a>
        <a href="contact.html" class="btn btn-secondary">
          <i class="fas fa-comments"></i> Contact Support
        </a>
      </div>
    `;
  } else {
    resultSection.style.display = 'none';
  }
}

function updateEstimatedCompletion(application) {
  const estimatedSection = document.getElementById('estimatedCompletion');
  const estimatedDate = document.getElementById('estimatedDate');

  if (application.status === 'approved' || application.status === 'rejected') {
    estimatedSection.style.display = 'none';
    return;
  }

  estimatedSection.style.display = 'flex';

  if (application.estimated_completion) {
    const date = new Date(application.estimated_completion);
    estimatedDate.textContent = date.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } else {
    estimatedDate.textContent = 'Processing...';
  }
}

// Helper functions
function formatStatus(status) {
  const formatted = {
    'pending': 'Pending',
    'submitted': 'Submitted',
    'in_review': 'In Review',
    'additional_info': 'Additional Info Required',
    'processing': 'Processing',
    'completed': 'Completed',
    'approved': 'Approved',
    'rejected': 'Rejected'
  };
  return formatted[status] || status;
}

function getStatusClass(status) {
  const classes = {
    'pending': 'status-pending',
    'submitted': 'status-pending',
    'in_review': 'status-in-review',
    'additional_info': 'status-in-review',
    'processing': 'status-in-review',
    'completed': 'status-approved',
    'approved': 'status-approved',
    'rejected': 'status-rejected'
  };
  return classes[status] || 'status-pending';
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
