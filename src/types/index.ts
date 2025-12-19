export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface InvoiceData {
  ECF: {
    Encabezado: any;
    DetallesItems: any;
    Subtotales: any;
  };
}

export interface SendInvoiceRequest {
  invoiceData: InvoiceData;
  rnc: string;
  encf: string;
  environment?: 'test' | 'cert' | 'prod';
}

export interface SignXmlRequest {
  xmlData: string;
  documentType: 'ECF' | 'ACECF' | 'ANECF' | 'RFCE' | 'ARECF';
}

export interface AuthRequest {
  environment?: 'test' | 'cert' | 'prod';
}

export interface InquiryRequest {
  rncEmisor: string;
  encf: string;
  rncComprador?: string;
  securityCode?: string;
}

export interface ApprovalData {
  ACECF: {
    DetalleAprobacionComercial: any;
  };
}

export interface VoidData {
  ANECF: {
    DetalleAnulacion: any;
  };
}
