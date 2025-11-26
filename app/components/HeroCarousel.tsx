"use client"
import { Box } from "@mui/material"
import Slider from "react-slick"
import Image from "next/image"

interface HeroCarouselProps {
  images: string[]
}

export default function HeroCarousel({ images }: HeroCarouselProps) {
  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 4000,
    arrows: true,
  }

  return (
    <Box sx={{ width: "100%", mb: 3 }}>
      <Slider {...settings}>
        {images.map((image, index) => (
          <Box key={index} sx={{ position: "relative", height: { xs: 200, sm: 300, md: 400 } }}>
            <Image
              src={image || "/placeholder.svg"}
              alt={`Banner ${index + 1}`}
              fill
              style={{ objectFit: "cover" }}
              priority={index === 0}
            />
          </Box>
        ))}
      </Slider>
    </Box>
  )
}
