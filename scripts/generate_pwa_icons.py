from pathlib import Path

from PIL import Image, ImageDraw


OUT_DIR = Path("/home/ubuntu/webdev-static-assets")


def draw_icon(size: int) -> Image.Image:
    scale = size / 192
    image = Image.new("RGBA", (size, size), "#F7F1E2")
    draw = ImageDraw.Draw(image)

    def point(value: float) -> float:
        return value * scale

    def polygon(points: list[tuple[float, float]], color: str) -> None:
        draw.polygon([(point(x), point(y)) for x, y in points], fill=color)

    polygon([(19, 164), (50, 164), (50, 133), (81, 133), (81, 102), (112, 102), (112, 71), (143, 71), (143, 40), (174, 40), (174, 164)], "#102B3A")
    polygon([(50, 164), (81, 164), (81, 133), (112, 133), (112, 102), (143, 102), (143, 71), (174, 71), (174, 164)], "#0B6B69")
    polygon([(62, 150), (79, 150), (79, 133), (96, 133), (96, 116), (113, 116), (113, 99), (130, 99), (130, 82), (147, 82), (147, 65), (164, 65), (164, 82), (147, 82), (147, 99), (130, 99), (130, 116), (113, 116), (113, 133), (96, 133), (96, 150), (79, 150), (79, 167), (62, 167)], "#F7F1E2")
    star = [(158, 16), (164.6, 30.4), (179, 37), (164.6, 43.6), (158, 58), (151.4, 43.6), (137, 37), (151.4, 30.4)]
    polygon(star, "#D6A64B")
    radius = point(4.4)
    center = (point(158), point(37))
    draw.ellipse((center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), fill="#FFF9E8")
    return image


for target in (192, 512):
    draw_icon(target).save(OUT_DIR / f"100-steps-to-life-app-icon-{target}.png", "PNG", optimize=True)
