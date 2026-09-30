declare module '@web3icons/react' {
  import type { SVGProps } from 'react'
  type IconProps = SVGProps<SVGSVGElement> & { className?: string }
  export const tokenIcons: Record<string, (props: IconProps) => JSX.Element>
}
