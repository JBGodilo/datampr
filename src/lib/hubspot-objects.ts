export type HsObjectId = "contacts" | "companies" | "deals" | "tickets";

export type HsObjectConfig = {
  id: HsObjectId;
  label: string;
  description: string;
  apiName: string;
  groupName: string;
  nameProperty: string;
  nameAliases: string[];
  defaultName: string | null;
  supportsPipeline: boolean;
  pipelineProperty?: string;
  stageProperty?: string;
  stageNoun: string;
};

export const HS_OBJECTS: Record<HsObjectId, HsObjectConfig> = {
  contacts: {
    id: "contacts",
    label: "Contact",
    description: "Create people records",
    apiName: "contacts",
    groupName: "contactinformation",
    nameProperty: "email",
    nameAliases: ["email", "e_mail", "mail", "email_address"],
    defaultName: null,
    supportsPipeline: false,
    stageNoun: "stage",
  },
  companies: {
    id: "companies",
    label: "Company",
    description: "Create company records",
    apiName: "companies",
    groupName: "companyinformation",
    nameProperty: "name",
    nameAliases: ["name", "company", "company_name", "companyname"],
    defaultName: "Company from import",
    supportsPipeline: false,
    stageNoun: "stage",
  },
  deals: {
    id: "deals",
    label: "Deal",
    description: "Create deal records",
    apiName: "deals",
    groupName: "dealinformation",
    nameProperty: "dealname",
    nameAliases: ["dealname", "deal_name", "name", "title", "subject", "deal", "address"],
    defaultName: "Deal from import",
    supportsPipeline: true,
    pipelineProperty: "pipeline",
    stageProperty: "dealstage",
    stageNoun: "deal stage",
  },
  tickets: {
    id: "tickets",
    label: "Ticket",
    description: "Create ticket records",
    apiName: "tickets",
    groupName: "ticketinformation",
    nameProperty: "subject",
    nameAliases: ["subject", "title", "name", "ticket_name"],
    defaultName: "Ticket from import",
    supportsPipeline: true,
    pipelineProperty: "hs_pipeline",
    stageProperty: "hs_pipeline_stage",
    stageNoun: "ticket status",
  },
};

export function getHsObject(id: string | null | undefined): HsObjectConfig | null {
  if (id && id in HS_OBJECTS) return HS_OBJECTS[id as HsObjectId];
  return null;
}
