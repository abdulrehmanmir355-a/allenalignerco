export const workflowSteps = [
  { title: "Register your practice", short: "Register", text: "Create your professional profile. Your account is reviewed before access to patient records and case tools is enabled.", detail: "Professional details · Practice information · Account verification", href: "/doctor-register", action: "Create your account" },
  { title: "Build a complete case", short: "Prepare", text: "Create a private patient case, organize clinical notes and upload scans or supporting records. Save a draft and continue when you are ready.", detail: "Patient record · Clinical files · Resumable uploads", href: "/doctor-dashboard/cases/new", action: "Prepare a case" },
  { title: "Review with confidence", short: "Review", text: "Review the laboratory’s written plan, discuss changes and record your decision. Every new plan has its own version and review history.", detail: "Version history · Case conversation · Doctor approval", href: "/doctor-dashboard/plans", action: "Open treatment plans" },
  { title: "Keep the next step in view", short: "Follow", text: "Follow laboratory updates from planning through production and shipment. The case timeline brings messages and decisions together.", detail: "Case status · Notifications · Shared timeline", href: "/doctor-dashboard", action: "Open your workspace" },
];

export const resourceItems = [
  { category: "Getting started", title: "Registering your practice", description: "The details you need, verification and your first sign-in.", href: "/for-doctors#registration" },
  { category: "Getting started", title: "The complete case journey", description: "Explore registration, case preparation, review and follow-up.", href: "/how-it-works" },
  { category: "Clinical records", title: "Preparing files for upload", description: "Supported formats, file sizes, pausing and resuming a transfer.", href: "/resources#uploads" },
  { category: "Clinical records", title: "Your private documents", description: "Find case records and download the version you need. Sign-in required.", href: "/doctor-dashboard/documents" },
  { category: "Case management", title: "Reviewing a treatment plan", description: "Open a proposed written plan, approve it or request an adjustment.", href: "/doctor-dashboard/plans" },
  { category: "Case management", title: "Organizing your patients", description: "Find patient records in your authenticated practice workspace.", href: "/doctor-dashboard/patients" },
  { category: "Account support", title: "Access and verification", description: "Understand pending verification and access to the doctor portal.", href: "/contact" },
  { category: "Case management", title: "Laboratory collaboration", description: "Open an assigned case using your case-specific lab credentials.", href: "/lab" },
];

export const commonQuestions = [
  { question: "What do I need to register?", answer: "Your full name, clinic or hospital name, email, phone number, professional registration number and a password of at least 12 characters." },
  { question: "Can I sign in immediately after registering?", answer: "Registration creates a pending account. Professional verification and clinic assignment must be completed before you can use the private doctor workspace." },
  { question: "Which clinical files can I upload?", answer: "When private storage is enabled, the large-file uploader accepts STL, PLY, DICOM Part 10 (.dcm), PDF, JPG and PNG files up to 1 GB each. The separate legacy uploader accepts files up to 10 MB." },
  { question: "What happens if an upload is interrupted?", answer: "Use Resume to continue from the chunks already received. After reloading the page, select the original file again. Incomplete large-file upload sessions remain resumable for 24 hours." },
  { question: "Who can access my case records?", answer: "The private portal checks your verified doctor account and case ownership. An assigned laboratory uses an expiring credential for its specific case. Clinical records are not available on the public website." },
  { question: "Can I request changes to a plan?", answer: "Yes. When the current written plan is awaiting review, open the case and describe the adjustment you need. The laboratory can publish a new version for your review." },
];

export const searchDestinations = [
  { title: "Customer Service · Module 47", description: "Tickets, ownership, priority and resolution", href: "/customer-service" },
  { title: "How it works", description: "Explore the case workflow", href: "/how-it-works" },
  { title: "For doctors", description: "Registration and professional tools", href: "/for-doctors" },
  { title: "Resource center", description: "File uploads, guides and common questions", href: "/resources" },
  { title: "Doctor login", description: "Sign in to your verified account", href: "/doctor-login" },
  { title: "Register your practice", description: "Create a professional account", href: "/doctor-register" },
  { title: "Cases", description: "Search and manage your private cases", href: "/doctor-dashboard/cases" },
  { title: "Patients", description: "Your private patient directory", href: "/doctor-dashboard/patients" },
  { title: "Documents", description: "Clinical uploads and file versions", href: "/doctor-dashboard/documents" },
  { title: "Treatment plans", description: "Review and approve written plans", href: "/doctor-dashboard/plans" },
  { title: "Notifications", description: "Updates from your case workflow", href: "/doctor-dashboard/notifications" },
  { title: "Contact and support", description: "Find the right next step", href: "/contact" },
  { title: "About Allen", description: "Our approach to digital workflows", href: "/about" },
];
