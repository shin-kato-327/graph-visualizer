export interface TaxonomyNode {
  name: string;
  description: string;
  owner: string;
  filename: string;
  parent: string | null;
  benchmark?: string;
}

export interface TreeNode {
  name: string;
  attributes?: {
    description: string;
    owner: string;
    filename: string;
  };
  children?: TreeNode[];
} 