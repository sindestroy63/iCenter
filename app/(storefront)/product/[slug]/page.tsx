import ProductView from "@/components/ProductView";
export default function ProductPage({params,searchParams}:{params:{slug:string};searchParams:{variant?:string}}){return <ProductView slug={params.slug} initialVariantId={searchParams.variant ?? ""}/>}
