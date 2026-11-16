-- Idempotent curated clinical reference drafts for Module 53.
-- New items are deliberately left in draft state for the existing HR review/publish workflow.
WITH inserted AS (
  INSERT INTO allen_kb_articles
    (id,title,category,content,status,created_by,updated_by)
  VALUES
    ('a1111111-5300-4000-8000-000000000001','Clear aligner case assessment: suitability, scope and consent','Training',$$Purpose
Use this checklist to support a comprehensive orthodontic assessment before recommending removable clear aligners. It is an educational aid, not a diagnostic protocol or substitute for clinician judgment.

Assessment
• Take and update the medical and dental history, including medications, relevant systemic conditions, previous dental treatment, oral hygiene, and the patient’s goals.
• Complete an appropriate extraoral and intraoral examination. Assess dentition, periodontal health, caries/restorative needs, occlusion, function, and relevant soft tissues.
• Obtain diagnostic records appropriate to the individual case. Select radiographs based on clinical indication and applicable standards; do not use imaging as a substitute for examination.
• Formulate a diagnosis and compare reasonable options, including aligners, fixed appliances, combined treatment, deferral, or referral. Aligners are not suitable or equally predictable for every movement or patient.
• Explain anticipated benefits, limitations, uncertainties, alternatives, likely responsibilities, monitoring, retention, costs, and material risks in a way the patient can understand. Document informed consent and the agreed objectives.

Decision and follow-up
Proceed only when the proposed objectives are clinically appropriate, the patient can participate in care, and the treating clinician has the competence and resources to supervise the case. Address active oral disease first when indicated. Refer or seek specialist input when complexity, risk, or required movement exceeds the treating clinician’s scope. Revisit the plan when clinical findings or patient goals change.

Sources
American Association of Orthodontists, Clear Aligners: https://aaoinfo.org/treatments/aligners/
$$,'draft','SYSTEM','SYSTEM'),
    ('a1111111-5300-4000-8000-000000000002','Clear aligner records and clinical monitoring','Training',$$Purpose
A practical framework for documenting and supervising aligner care. Adapt the record set and review interval to diagnosis, risk, treatment stage, local standards, and the device instructions.

Before treatment
Record the diagnosis, treatment objectives, relevant history, examination findings, periodontal and caries status, occlusion, and the rationale for selected records. Capture appropriate photographs, scans or impressions, and clinically indicated imaging. Record the approved treatment plan, consent, appliance stages, attachments or adjuncts, and patient-specific instructions.

During treatment
At review, assess the patient as well as the appliance: fit and tracking, attachment engagement when applicable, oral hygiene and tissue health, symptoms, occlusion and progress toward the agreed objectives. Document findings, advice, changes to the plan, and the next review. Investigate a persistent discrepancy between the planned and observed movement instead of assuming the next stage will correct it. Reassess the diagnosis and plan if progress, health, or patient circumstances change.

Remote check-ins can supplement care when appropriate, but images or software do not replace an examination when one is clinically indicated. Establish a clear route for patients to report symptoms or appliance problems, and arrange in-person assessment when remote information is insufficient or a concern requires examination.

Sources
American Association of Orthodontists, Clear Aligners: https://aaoinfo.org/treatments/aligners/
British Orthodontic Society, Guidance on teledentistry and remote interactions in orthodontic care: https://bos.org.uk/wp-content/uploads/2022/03/British-Orthodontic-Society-Guidance-on-teledentistry-and-remote-interactions-in-orthodontic-careFinal-v5awamended.pdf$$,'draft','SYSTEM','SYSTEM'),
    ('a1111111-5300-4000-8000-000000000003','Oral health and appliance care during aligner treatment','Training',$$Patient-facing points for clinicians to tailor to the individual and the aligner manufacturer’s instructions.

• Reinforce brushing twice daily with fluoride toothpaste, cleaning between teeth daily, a balanced diet that limits frequent sugary snacks and drinks, and regular dental care according to the patient’s needs.
• Encourage patients to clean their teeth before reinserting a removable appliance when feasible, so food debris and sugars are not trapped against the teeth.
• Explain how to clean and store the appliance using the manufacturer’s instructions. Avoid advice that could distort or damage the material; device-specific instructions take precedence.
• Review plaque control, gingival health, caries risk, and the patient’s ability to maintain hygiene at follow-up. Provide individualized prevention or periodontal care where indicated.
• Ask the patient to report persistent soreness, tissue injury, swelling, worsening bleeding, or other new oral-health concerns so they can be assessed.

The patient’s general preventive plan should remain coordinated with their usual dental care. Advice should be adapted to age, risk, disability, medication, and other individual factors.

Sources
American Dental Association, Home Oral Care: https://www.ada.org/resources/ada-library/oral-health-topics/home-care
$$,'draft','SYSTEM','SYSTEM'),
    ('a1111111-5300-4000-8000-000000000004','Poor tracking, discomfort and appliance problems: response guide','Troubleshooting',$$This guide supports triage and documentation; it does not prescribe a remote diagnosis or a universal tray-change schedule.

When a patient reports poor fit, a tray that will not seat, a cracked or lost appliance, persistent pain, tissue irritation, or an unexpected bite change:
1. Ask which appliance and treatment stage are involved, when the concern began, whether it is worsening, and whether there was trauma or another relevant event. Ask for images only through approved channels and when useful.
2. Screen for urgent symptoms such as facial swelling, significant trauma, uncontrolled bleeding, fever with oral symptoms, difficulty swallowing or breathing, or rapidly worsening pain. Direct the patient to appropriate urgent or emergency care when indicated by the symptoms and local protocols.
3. Do not advise the patient to force an appliance, trim or alter it, skip ahead, or independently change the prescribed sequence. Provide case-specific instructions from the treating clinician and device protocol.
4. Arrange timely clinical review when fit, tooth movement, periodontal health, occlusion, or appliance integrity cannot be confidently assessed remotely. Pause progression when clinically appropriate until the issue is assessed.
5. Document the report, triage, advice, assessment, decision, and follow-up. Escalate suspected device defects through the manufacturer’s process and applicable reporting requirements.

Sources
British Orthodontic Society, Clear Aligner Fact Sheet: https://bos.org.uk/wp-content/uploads/2022/02/Clear-Aligner-Fact-Sheet-FINAL.pdf
American Association of Orthodontists, Clear Aligners: https://aaoinfo.org/treatments/aligners/$$,'draft','SYSTEM','SYSTEM'),
    ('a1111111-5300-4000-8000-000000000005','Retention after orthodontic treatment','Training',$$Retention is part of orthodontic treatment planning. Teeth can move after active treatment, and relapse risk may persist over time.

At the end of active treatment, confirm the clinical result and provide a retention plan suited to the patient, treatment, and risk. Explain the type of retainer, fit and care, the prescribed wear schedule, review arrangements, and how to obtain help if it is lost, damaged, or no longer fits. Avoid presenting one wear schedule as suitable for every patient; the treating clinician should set and adjust instructions.

Continue appropriate dental and orthodontic follow-up. For removable retainers, review fit, condition, and adherence. For fixed retainers, reinforce cleaning around the retainer and arrange assessment if it is loose, broken, uncomfortable, or associated with hygiene or tissue concerns. Reassess promptly when a retainer no longer fits rather than advising forceful seating.

Source
British Orthodontic Society, Everything you need to know before having your teeth straightened: https://bos.org.uk/patients/treatments/orthodontics-for-adults/everything-you-need-to-know-before-having-your-teeth-straightened/$$,'draft','SYSTEM','SYSTEM')
  ON CONFLICT (id) DO NOTHING
  RETURNING *
)
INSERT INTO allen_kb_audit(article_id,actor_id,action,before_data,after_data)
SELECT id,'SYSTEM','curate_draft',NULL,to_jsonb(inserted) FROM inserted;
