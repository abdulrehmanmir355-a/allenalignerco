export const qcStages=['INCOMING','IN_PROCESS','FINAL'] as const;
export const qcDispositions=['PASS','HOLD','REWORK','REJECT'] as const;
export const qcStageLabels={INCOMING:'Incoming QC',IN_PROCESS:'In-Process QC',FINAL:'Final QC'} as const;
export const qcChecklists={
 INCOMING:{materialIdentity:'Material / component identity verified',quantity:'Quantity and lot documentation verified',condition:'Packaging and incoming condition acceptable'},
 IN_PROCESS:{dimensionalAccuracy:'In-process dimensions verified',applianceIntegrity:'Appliance integrity and workmanship checked',fitCheck:'Fit and stage sequence checked against approved plan'},
 FINAL:{planMatch:'Finished product matches approved plan',labeling:'Patient, case and traceability labels verified',packaging:'Final inspection and packaging readiness confirmed'},
} as const;
