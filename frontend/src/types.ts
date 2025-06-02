export interface TaxonomyNode {
  name: string;
  description: string;
  owner: string | string[];
  filename: string;
  parent: string | null;
  benchmark?: string;
  location?: string;
  type?: string;
}

export interface TreeNode {
  name: string;
  attributes?: {
    description: string;
    owner: string | string[];
    filename: string;
    location?: string;
    type?: string;
    hasHiddenChildren?: boolean;
    hasChildren?: boolean;
  };
  children?: TreeNode[];
} 