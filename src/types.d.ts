declare module '@web3icons/react' {
  import type { SVGProps } from 'react'
  type IconProps = SVGProps<SVGSVGElement> & { className?: string; variant?: 'branded' | 'mono' | 'background'; size?: number | string }
  export const tokenIcons: Record<string, (props: IconProps) => JSX.Element>
  export const networkIcons: Record<string, (props: IconProps) => JSX.Element>
  export const NetworkTempo: (props: IconProps) => JSX.Element
  export const NetworkSolana: (props: IconProps) => JSX.Element
  export const NetworkBase: (props: IconProps) => JSX.Element
}
